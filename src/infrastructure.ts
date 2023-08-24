import { Duration } from 'aws-cdk-lib';
import {
  RestApi,
  LambdaIntegration,
  EndpointType,
  MethodLoggingLevel,
  CognitoUserPoolsAuthorizer,
  AuthorizationType,
} from 'aws-cdk-lib/aws-apigateway';
import { IUserPool } from 'aws-cdk-lib/aws-cognito';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  ManagedPolicy,
  Role,
  PolicyStatement,
  PolicyDocument,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Code, Function } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface InfrastructureProps {
  readonly fromPhoneNumber: string;
  readonly smaId: string;
  readonly userPool: IUserPool;
  calledNumber: Table;
}

export class Infrastructure extends Construct {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: InfrastructureProps) {
    super(scope, id);

    const infrastructureRole = new Role(this, 'infrastructureRole', {
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

    const callControlLambda = new Function(this, 'callControlLambda', {
      code: Code.fromAsset('src/resources/callControl'),
      handler: 'index.lambda_handler',
      runtime: Runtime.PYTHON_3_9,
      architecture: Architecture.ARM_64,
      environment: {
        CallForwardingTableName: props.calledNumber.tableName,
        SMA_ID: props.smaId,
      },
      role: infrastructureRole,
      timeout: Duration.seconds(10),
    });
    props.calledNumber.grantReadWriteData(callControlLambda);

    const api = new RestApi(this, 'callForwardingAPI', {
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'POST'],
        allowCredentials: true,
        allowOrigins: ['*'],
      },
      deployOptions: {
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      endpointConfiguration: {
        types: [EndpointType.REGIONAL],
      },
    });

    const auth = new CognitoUserPoolsAuthorizer(this, 'auth', {
      cognitoUserPools: [props.userPool],
    });

    const updateNumber = api.root.addResource('updateNumber');
    const queryNumber = api.root.addResource('queryNumber');
    const listVoiceConnectors = api.root.addResource('listVoiceConnectors');

    const callControlIntegration = new LambdaIntegration(callControlLambda);

    updateNumber.addMethod('POST', callControlIntegration, {
      authorizer: auth,
      authorizationType: AuthorizationType.COGNITO,
    });
    queryNumber.addMethod('POST', callControlIntegration, {
      authorizer: auth,
      authorizationType: AuthorizationType.COGNITO,
    });
    listVoiceConnectors.addMethod('POST', callControlIntegration, {
      authorizer: auth,
      authorizationType: AuthorizationType.COGNITO,
    });

    this.apiUrl = api.url;
  }
}
