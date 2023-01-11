import { Duration, Stack } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  ServicePrincipal,
  Role,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Code, Function } from 'aws-cdk-lib/aws-lambda';

import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  ChimeSipMediaApp,
  ChimePhoneNumber,
  PhoneProductType,
  PhoneNumberType,
} from 'cdk-amazon-chime-resources';
import { Construct } from 'constructs';

export interface PSTNAudioProps {
  outgoingWav: Bucket;
  calledNumber: Table;
}
export class PSTNAudio extends Construct {
  public readonly fromNumber: string;
  public readonly smaId: string;

  constructor(scope: Construct, id: string, props: PSTNAudioProps) {
    super(scope, id);

    const phoneNumber = new ChimePhoneNumber(this, 'phoneNumber', {
      phoneState: 'IL',
      phoneNumberType: PhoneNumberType.LOCAL,
      phoneProductType: PhoneProductType.SMA,
    });

    const smaHandlerRole = new Role(this, 'smaHandlerRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      inlinePolicies: {
        ['chimePolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['chime:*'],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const smaHandler = new Function(this, 'smaHandler', {
      code: Code.fromAsset('src/resources/smaHandler'),
      handler: 'index.lambda_handler',
      runtime: Runtime.PYTHON_3_9,
      architecture: Architecture.ARM_64,
      environment: {
        CallForwardingTableName: props.calledNumber.tableName,
        WavBucketName: props.outgoingWav.bucketName,
        LoopGreetingWhileRinging: 'True',
      },
      role: smaHandlerRole,
      timeout: Duration.seconds(6),
    });
    props.calledNumber.grantReadWriteData(smaHandler);

    const sipMediaApp = new ChimeSipMediaApp(this, 'sipMediaApp', {
      region: Stack.of(this).region,
      endpoint: smaHandler.functionArn,
    });

    this.fromNumber = phoneNumber.phoneNumber;
    this.smaId = sipMediaApp.sipMediaAppId;
  }
}
