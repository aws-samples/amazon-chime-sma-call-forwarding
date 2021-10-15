import os
import time
import json
import boto3
import logging
from datetime import date, datetime
from botocore.client import Config

# Load environment variables
sma_id = os.environ['SMA_ID']
forwarding_table_name = os.environ['CallForwardingTableName']

# Setup DynamoDB & Chime interface clients
client_config = Config(connect_timeout=2, read_timeout=2,
                       retries={'max_attempts': 5})
dynamodb_client = boto3.client(
    'dynamodb', config=client_config, region_name=os.environ["AWS_REGION"])
chime_client = boto3.client(
    'chime', config=client_config, region_name=os.environ["AWS_REGION"])

# Set LogLevel using environment variable, fallback to INFO if not present
logger = logging.getLogger()
try:
    log_level = os.environ['LogLevel']
    if log_level not in ['INFO', 'DEBUG']:
        log_level = 'INFO'
except:
    log_level = 'INFO'
logger.setLevel(log_level)


# Lambda entry point for all event types
def lambda_handler(event, context):
    method = event['resource'][1::]
    logger.info('[{}] event invoked with body: {}'.format(
        method, event['body']))

    response = {
        'statusCode': '200',
        'body': '',
        'headers': {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS, POST',
            'Content-Type': 'application/json'
        }
    }

    if (method == 'queryNumber'):
        response['body'] = json.dumps(
            chime_client.list_phone_numbers(), default=json_serial)

    elif (method == 'listVoiceConnectors'):
        response['body'] = json.dumps(
            chime_client.list_voice_connectors(), default=json_serial)

    elif (method == 'updateNumber'):
        body = json.loads(event['body'])
        queried_number = chime_client.get_phone_number(
            PhoneNumberId=body['PhoneNumber']
        )
        if (body['ProductType'] == 'SipMediaApplicationDialIn'):
            response['statusCode'], response['body'] = enable_forward(
                body, queried_number)

        elif (body['ProductType'] == 'VoiceConnector'):
            response['statusCode'], response['body'] = disable_forward(
                body, queried_number)
        else:
            response['body'] = "Unknown ProductType: " + body['ProductType']

    else:
        response['body'] = "Not Found"
        response['statusCode'] = '404'

    logger.info('Responding with: {} {}'.format(
        response['statusCode'], response['body']))
    logger.info(response)
    return response


def json_serial(data):
    if isinstance(data, (datetime, date)):
        return data.isoformat()
    raise TypeError("Type %s not serializable" % type(data))


def enable_forward(body, queried_number):
    logger.info('Enabling forward for {} to {}'.format(
        body['PhoneNumber'], body['ForwardToNumber']))
    if not ddb_add_forward(body['PhoneNumber'], body['ForwardToNumber']):
        return '500', json.dumps('Failed to enable number forward', default=json_serial)
    if queried_number['PhoneNumber']['ProductType'] == 'SipMediaApplicationDialIn' and queried_number['PhoneNumber']['Status'] == 'Assigned':
        return '200', json.dumps({'Message': 'ProductType already SMA'}, default=json_serial)
    else:
        return '200', json.dumps(assign_number_to_SMA(queried_number), default=json_serial)


def disable_forward(body, queried_number):
    logger.info('Disabling forward for {}'.format(body['PhoneNumber']))
    if not ddb_remove_forward(body['PhoneNumber']):
        return '500', json.dumps('Failed to disable number forward', default=json_serial)

    if (queried_number['PhoneNumber']['ProductType'] == 'VoiceConnector'):
        return '200', json.dumps('{} is already a Voice Connector product type'.format(body['PhoneNumber']), default=json_serial)
    else:
        return '200', json.dumps(assign_number_to_VC(queried_number, body['VoiceConnectorId']), default=json_serial)


# Change Product Type of number to SipMediaApplicationDialin
def assign_number_to_SMA(queried_number):
    number = queried_number['PhoneNumber']['E164PhoneNumber']
    logger.info('Assigning {} to SMA'.format(number))

    get_sma_response = chime_client.get_sip_media_application(
        SipMediaApplicationId=sma_id
    )

    # Associate number with SMA
    if queried_number['PhoneNumber']['ProductType'] == 'VoiceConnector':
        if queried_number['PhoneNumber']['Status'] == 'Assigned':
            chime_client.disassociate_phone_numbers_from_voice_connector(
                VoiceConnectorId=queried_number['PhoneNumber']['Associations'][0]['Value'],
                E164PhoneNumbers=[
                    number
                ]
            )

        chime_client.update_phone_number(
            PhoneNumberId=number,
            ProductType='SipMediaApplicationDialIn'
        )

    create_sip_rule_response = chime_client.create_sip_rule(
        Name=number,
        TriggerType='ToPhoneNumber',
        TriggerValue=number,
        Disabled=False,
        TargetApplications=[
            {
                'SipMediaApplicationId': sma_id,
                'Priority': 1,
                'AwsRegion': get_sma_response['SipMediaApplication']['AwsRegion']
            },
        ]
    )
    return create_sip_rule_response


# Change Product Type of number to VoiceConnector
def assign_number_to_VC(queried_number, voice_connector_ID):
    number = queried_number['PhoneNumber']['E164PhoneNumber']
    logger.info('Assigning {} to Voice Connector {}'.format(
        number, voice_connector_ID))

    # Disable and delete the associated SIP Rule
    if (queried_number['PhoneNumber']['Status'] == 'Assigned'):
        chime_client.update_sip_rule(
            SipRuleId=queried_number['PhoneNumber']['Associations'][0]['Value'],
            Name=queried_number['PhoneNumber']['Associations'][0]['Name'],
            Disabled=True,
        )
        chime_client.delete_sip_rule(
            SipRuleId=queried_number['PhoneNumber']['Associations'][0]['Value']
        )

    # Wait for the status to be changed to Unassigned
    while (queried_number['PhoneNumber']['Status'] == 'Assigned'):
        time.sleep(2)
        queried_number = chime_client.get_phone_number(
            PhoneNumberId=number
        )

    # Set Product Type to VC
    chime_client.update_phone_number(
        PhoneNumberId=number,
        ProductType='VoiceConnector'
    )

    # Associate number with a Voice Connector
    vc_associate_response = chime_client.associate_phone_numbers_with_voice_connector(
        VoiceConnectorId=voice_connector_ID,
        E164PhoneNumbers=[
            number,
        ],
        ForceAssociate=True
    )
    return vc_associate_response


# Add DynamoDB entry for forwarding
def ddb_add_forward(from_number, to_number):
    try:
        response = dynamodb_client.put_item(
            Item={
                'dialed_number': {
                    'S': str(from_number),
                },
                'destination_number': {
                    'S': str(to_number),
                }
            },
            TableName=forwarding_table_name,
        )
        if response['ResponseMetadata']['HTTPStatusCode'] == 200:
            return response
    except Exception as err:
        logger.error(
            'DynamoDB Query error: failed to insert data into table. Error: ', exc_info=err)
        return None


# Remove DynamoDB entry for forwarding
def ddb_remove_forward(from_number):
    try:
        response = dynamodb_client.delete_item(
            Key={
                'dialed_number': {
                    'S': str(from_number),
                }
            },
            TableName=forwarding_table_name,
        )
        if response['ResponseMetadata']['HTTPStatusCode'] == 200:
            return response
    except Exception as err:
        logger.error(
            'DynamoDB Query error: failed to delete data from table. Error: ', exc_info=err)
        return None
