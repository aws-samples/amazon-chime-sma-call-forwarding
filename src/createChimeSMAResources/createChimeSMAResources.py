import boto3
import time

chime = boto3.client("chime")


def get_phone_number():
    search_response = chime.search_available_phone_numbers(
        # AreaCode='string',
        # City='string',
        # Country='string',
        State="IL",
        # TollFreePrefix='string',
        MaxResults=1,
    )
    phone_number_to_order = search_response["E164PhoneNumbers"][0]
    print("Phone Number: " + phone_number_to_order)
    phone_order = chime.create_phone_number_order(
        ProductType="SipMediaApplicationDialIn",
        E164PhoneNumbers=[
            phone_number_to_order,
        ],
    )
    print("Phone Order: " + str(phone_order))

    check_phone_order = chime.get_phone_number_order(
        PhoneNumberOrderId=phone_order["PhoneNumberOrder"]["PhoneNumberOrderId"]
    )
    order_status = check_phone_order["PhoneNumberOrder"]["Status"]
    timeout = 0

    while not order_status == "Successful":
        timeout += 1
        print("Checking status: " + str(order_status))
        time.sleep(5)
        check_phone_order = chime.get_phone_number_order(
            PhoneNumberOrderId=phone_order["PhoneNumberOrder"]["PhoneNumberOrderId"]
        )
        order_status = check_phone_order["PhoneNumberOrder"]["Status"]
        if order_status == "Failed":
            raise Exception("Order number failed: {}".format(check_phone_order))
        if timeout == 5:
            return "Could not get phone number: {}".format(check_phone_order)
    return phone_number_to_order


def create_SMA(region, name, lambdaArn):
    sma_create_response = chime.create_sip_media_application(
        AwsRegion=region,
        Name=name + "-SMA",
        Endpoints=[
            {"LambdaArn": lambdaArn},
        ],
    )
    print("sma create: " + str(sma_create_response))
    return sma_create_response["SipMediaApplication"]["SipMediaApplicationId"]


def create_sip_rule(name, phone_number, sma_ID, region):
    print(phone_number)
    sip_rule_response = chime.create_sip_rule(
        Name=name,
        TriggerType="ToPhoneNumber",
        TriggerValue=phone_number,
        Disabled=False,
        TargetApplications=[
            {"SipMediaApplicationId": sma_ID, "Priority": 1, "AwsRegion": region},
        ],
    )
    print("sip rule response: " + str(sip_rule_response))
    return sip_rule_response


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
    physical_id = "smaResources"
    region = event["ResourceProperties"]["region"]
    name = event["ResourceProperties"]["smaName"]
    lambdaArn = event["ResourceProperties"]["lambdaArn"]

    new_phone_number = get_phone_number()
    sma_ID = create_SMA(region, name, lambdaArn)
    rule_name = str(new_phone_number).replace("+", "")
    sip_rule_response = create_sip_rule(rule_name, new_phone_number, sma_ID, region)
    create_SMA_response = {"smaID": sma_ID, "phoneNumber": new_phone_number}
    return {"PhysicalResourceId": physical_id, "Data": create_SMA_response}


def on_update(event):
    physical_id = event["PhysicalResourceId"]
    props = event["ResourceProperties"]
    print("update resource %s with props %s" % (physical_id, props))
    return {"PhysicalResourceId": physical_id}


def on_delete(event):
    physical_id = event["PhysicalResourceId"]
    print("delete resource %s" % physical_id)
    return {"PhysicalResourceId": physical_id}
