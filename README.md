# Call Forwarding with Amazon Chime SIP Media Application

This demo will build and configure several services within AWS so that you can forward calls using a Chime SIP Media Application, more specifically the [CallAndBridge](https://docs.aws.amazon.com/chime/latest/dg/call-and-bridge.html) action. A local client can be used to manage the forwarding of numbers.
## Overview

![Overview](/images/Overview.png)
## Requirements
- node V12+/npm [installed](https://www.npmjs.com/get-npm)
- yarn [installed](https://classic.yarnpkg.com/en/docs/install)
  - `npm install --global yarn`
- AWS CLI [installed](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)
- AWS CDK [installed](https://docs.aws.amazon.com/cdk/latest/guide/getting_started.html#getting_started_install)
  - `npm install -g aws-cdk`
  - Be sure to have the latest version installed. If you need to upgrade, uninstall with `npm uninstall -g aws-cdk` and then reinstall.
- AWS CDK [bootstrapped](https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html)
  - `cdk bootstrap`
- AWS Credentials [configured](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html) for the account/region that will be used for this demo
- Ability/Permissions to create Chime SIP Media Applications and Phone Numbers (ensure your [Service Quota](https://console.aws.amazon.com/servicequotas/home/services/chime/quotas) in us-east-1 for Phone Numbers have not been reached)
- Deployment must be done in us-east-1 or us-west-2 to align with SIP Media Application resources

## Deployment
### Back-end Resources
- Clone this repo: `git clone https://github.com/aws-samples/amazon-chime-sma-call-forwarding`
- `cd amazon-chime-sma-call-forwarding`
- `npm install @aws-cdk/core`
- `./deploy.sh`
- Accept prompts for CDK deployment

### Local client
- `cd client`
- `yarn`
- `yarn start`

## Description
This deployment will build everything required to forward calls and change numbers between different Amazon Chime Product Types.  Phone Numbers within Amazon Chime Phone Inventory can have a Product Type of `SipMediaApplicationDialIn` or `VoiceConnector`. The local client can update the Product Type of the phone numbers in the Phone Inventory and update a DynanamoDB table with call forwarding information. A Lambda function associated with the SIP Media Application is used to forward numbers using the [CallandBridge action](https://docs.aws.amazon.com/chime/latest/dg/call-and-bridge.html).

## Operation

### Background
You should familiarize yourself with the SipMediaApplication concepts and how one would build a Lambda to control the flow of a call. You can read more here: https://docs.aws.amazon.com/chime/latest/dg/build-lambdas-for-sip-sdk.html


### Phone Number Product Types
Within Amazon Chime, a phone number must have one of three Product Types:
- BusinessCalling
- VoiceConnector
- SipMediaApplicationDialIn

In this demonstration, we will not be using the BusinessCalling Product Type but focusing on VoiceConnector and SipMediaApplicationDialIn.

To forward a number, we will use the SipMediaApplicationDialIn Product Type to route the call to a new phone number. To do this, we must ensure the number is associated with an Amazon Chime SIP Media Application rule.  This will route the call to an associated SIP Media Application. This SIP Media Application will invoke the smaLambda and return an action based on the results of a DynamoDB lookup.

### Changing Product Types

The handlerLambda will change Product Types for you based on the current Product Type and if you are adding a forward or removing a forward.  To add a forward to a number, it must be changed to the SipMediaApplicationDialIn Product Type. Conversely, to remove a forward, the Product Type should be changed to VoiceConnector.

### Forwarding The Number
When a call is placed to the phone number configured with the SipMediaApplicationDialInWithin Product Type, a SIP Media Application rule will route it to the SIP media application.  This will invoke the smaLambda and the CallAndBridge action will be returned to the SIP Media Application. This will forward/bridge the incoming PSTN call to a new outbound call to the E.164 number stored in the DynamoDB.

```python
def call_and_bridge_to_pstn(caller_id, destination):
    return {
        'Type': 'CallAndBridge',
        'Parameters': {
            'CallTimeoutSeconds': 30,
            'CallerIdNumber': caller_id,
            'Endpoints':
            [
                {
                    'Uri': destination,
                    'BridgeEndpointType': 'PSTN'
                }
            ]
        }
    }
```
### Client - Forwarding a Number
Using the local client, forward a phone number to a different number. This creates a SipMediaApplication rule for the phone number to point to your Lambda, and creates a call forward for the number in the DynamoDB table. 

- Select 'Forward a Number' Action
- Select a Number
- Enter an E.164 number to forward to

![Example Forward](images/Forwarding.png)

### Client - Removing a Forward
Using the local client, remove an existing call forward. This removes the phone number entry in the DynamoDB table, removes the SipMediaApplication rule for the phone number, and assigns the phone number to a Voice Connector


- Select 'Remove a Forward' Action
- Select a Number associated with an SMA
- Select a Voice Connector to associate the number to

![Example Remove Forward](images/RemoveForward.png)

## Resources Created
- handlerLambda - A Python Lambda that updates the Product Type of numbers in the Amazon Chime Phone Inventory and a DynamoDB
- smaLambda - A Python Lambda that is associated with a SIP Media Application used to forward calls using the CallandBridge action
- calledNumber Table - A DynamoDB table used to track where numbers should be forwarded to.  Updated from the local client and queried by the smaLambda
- outgoingWav Bucket - S3 bucket to store wav files for playing customized messages
- SIP Media Application - Chime SMA used to forward calls.  Associated with smaHandler Lambda
- SIP Media Application rule - Chime SMA Rule used to connect the provisioned phone number to the SIP Media Application
- Voice Connector - Chime Voice Connector used to demonstrate changing Product Types
- Phone Number - a number provisioned to use with the SIP Media Application rule

## Additional Resources
- utils\createWav.py - Python script to create wav files using Polly
- wav_files\\* - wav files uploaded to outgoingWav bucket for use with SMA

## Cleanup
To clean up this demo: `cdk destroy`.  Additionally, Chime SIP Media Applications, rules, voice connectors, and phone numbers should be manually removed in the Chime Console.

