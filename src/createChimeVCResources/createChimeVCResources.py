import boto3
import time
import uuid

chime = boto3.client("chime")


def get_phone_number():
    print("Getting Phone Number")
    search_response = chime.search_available_phone_numbers(
        # AreaCode='string',
        # City='string',
        # Country='string',
        # TollFreePrefix='string',
        State="CA",
        MaxResults=1,
    )
    phone_number_to_order = search_response["E164PhoneNumbers"][0]
    print("Phone Number: {}".format(phone_number_to_order))
    phone_order = chime.create_phone_number_order(
        ProductType="VoiceConnector",
        E164PhoneNumbers=[
            phone_number_to_order,
        ],
    )
    print("Phone Order: {}".format(phone_order))

    check_phone_order = chime.get_phone_number_order(
        PhoneNumberOrderId=phone_order["PhoneNumberOrder"]["PhoneNumberOrderId"]
    )
    order_status = check_phone_order["PhoneNumberOrder"]["Status"]
    timeout = 0

    while not order_status == "Successful":
        timeout += 1
        print("Checking status: {}".format(order_status))
        time.sleep(5)
        check_phone_order = chime.get_phone_number_order(
            PhoneNumberOrderId=phone_order["PhoneNumberOrder"]["PhoneNumberOrderId"]
        )
        order_status = check_phone_order["PhoneNumberOrder"]["Status"]
        if order_status == "Failed":
            raise Exception("Order number failed: {}".format(check_phone_order))
        if timeout == 5:
            return "Could not get phone number: {}".format(check_phone_order)
    print("Phone Number Ordered: {}".format(phone_number_to_order))
    return phone_number_to_order


def create_voice_connector(region):
    print("Creating Voice Connector")
    response = chime.create_voice_connector(
        Name="Trunk{}".format(uuid.uuid1()), AwsRegion=region, RequireEncryption=False
    )
    voice_connector_id = response["VoiceConnector"]["VoiceConnectorId"]
    outbound_hostname = response["VoiceConnector"]["OutboundHostName"]
    voice_connector = {"voiceConnectorId": voice_connector_id, "outboundHostName": outbound_hostname}
    print("Voice Connector Created: {}".format(response))
    print("voiceConnector: {}".format(voice_connector))
    return voice_connector


def associate_phone_number(voice_connector, phoneNumber):
    print("Associating Phone Number: {} with Voice Connector {}".format(phoneNumber, voice_connector))
    response = chime.associate_phone_numbers_with_voice_connector(
        VoiceConnectorId=voice_connector["voiceConnectorId"],
        E164PhoneNumbers=[
            phoneNumber,
        ],
        ForceAssociate=True,
    )
    print("Phone Number associated: {}".format(response))
    voice_connector["phoneNumber"] = phoneNumber
    return voice_connector


def on_event(event, context):
    print(event)
    request_type = event["RequestType"]
    if request_type == "Create":
        return on_create(event)
    if request_type == "Update":
        return on_update(event)
    if request_type == "Delete":
        return on_delete(event)
    raise Exception("Invalid request type: %s" % request_type)


def on_create(event):
    physical_id = "VoiceConnectorResources"
    region = event["ResourceProperties"]["region"]
    new_phone_number = get_phone_number()
    voice_connector = create_voice_connector(region)
    voice_connector = associate_phone_number(voice_connector, new_phone_number)

    print(str(voice_connector))
    return {"PhysicalResourceId": physical_id, "Data": voice_connector}


def on_update(event):
    physical_id = event["PhysicalResourceId"]
    props = event["ResourceProperties"]
    print("Update resource %s with props %s" % (physical_id, props))
    return {"PhysicalResourceId": physical_id}


def on_delete(event):
    physical_id = event["PhysicalResourceId"]
    print("delete resource %s" % physical_id)
    return {"PhysicalResourceId": physical_id}
