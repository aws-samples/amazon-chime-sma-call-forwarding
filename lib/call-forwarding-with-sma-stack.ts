import * as cdk from "@aws-cdk/core";
import dynamodb = require("@aws-cdk/aws-dynamodb");
import iam = require("@aws-cdk/aws-iam");
import lambda = require("@aws-cdk/aws-lambda");
import custom = require("@aws-cdk/custom-resources");
import { CustomResource, Duration } from "@aws-cdk/core";
import apigateway = require("@aws-cdk/aws-apigateway");
import s3 = require("@aws-cdk/aws-s3");
import s3deploy = require("@aws-cdk/aws-s3-deployment");

export class CallForwardingWithSMA extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const outgoingWav = new s3.Bucket(this, "outgoingWav", {
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // NOT recommended for production code
    });

    const outboundWavBucketPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:GetObject", "s3:PutObject", "s3:PutObjectAcl"],
      principals: [
        new iam.ServicePrincipal("voiceconnector.chime.amazonaws.com"),
      ],
      resources: [outgoingWav.bucketArn, `${outgoingWav.bucketArn}/*`],
      sid: "SIPMediaApplicationRead",
    });

    outgoingWav.addToResourcePolicy(outboundWavBucketPolicy);

    new s3deploy.BucketDeployment(this, "WavDeploy", {
      sources: [s3deploy.Source.asset("./wav_files")],
      destinationBucket: outgoingWav,
      contentType: "audio/wav",
    });

    const calledNumber = new dynamodb.Table(this, "calledNumber", {
      partitionKey: {
        name: "dialed_number",
        type: dynamodb.AttributeType.STRING,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    const smaLambdaRole = new iam.Role(this, "smaLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    const handlerLambdaRole = new iam.Role(this, "handlerLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        ["chimePolicy"]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ["*"],
              actions: [
                "chime:ListVoiceConnectors",
                "chime:ListPhoneNumbers",
                "chime:GetPhoneNumber",
                "chime:UpdateSipRule",
                "chime:DeleteSipRule",
                "chime:UpdatePhoneNumber",
                "chime:AssociatePhoneNumbersWithVoiceConnector",
                "chime:DisassociatePhoneNumbersFromVoiceConnector",
                "chime:GetSipMediaApplication",
                "chime:CreateSipRule",
              ],
            }),
          ],
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    const chimeCreateRole = new iam.Role(this, "createChimeLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        ["chimePolicy"]: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              resources: ["*"],
              actions: [
                "chime:CreateVoiceConnector",
                "chime:GetVoiceConnector",
                "chime:UpdateVoiceConnector",
                "chime:CreateSipMediaApplication",
                "chime:CreateSipRule",
                "chime:GetSipMediaApplication",
                "chime:GetSipRule",
                "chime:UpdateSipMediaApplication",
                "chime:UpdateSipRule",
                "chime:AssociatePhoneNumbersWithVoiceConnector",
                "chime:CreatePhoneNumberOrder",
                "chime:GetPhoneNumber",
                "chime:GetPhoneNumberOrder",
                "chime:SearchAvailablePhoneNumbers",
                "chime:UpdatePhoneNumber",
                "lambda:GetPolicy",
                "lambda:AddPermission",
              ],
            }),
          ],
        }),
      },
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    const smaLambda = new lambda.Function(this, "smaLambda", {
      code: lambda.Code.fromAsset("src/smaLambda"),
      handler: "callForwardingSMA.lambda_handler",
      runtime: lambda.Runtime.PYTHON_3_8,
      environment: {
        CallForwardingTableName: calledNumber.tableName,
        WavBucketName: outgoingWav.bucketName,
        LoopGreetingWhileRinging: "True",
      },
      role: smaLambdaRole,
      timeout: Duration.seconds(6),
    });
    calledNumber.grantReadWriteData(smaLambda);

    const createSMALambda = new lambda.Function(this, "createSMALambda", {
      code: lambda.Code.fromAsset("src/createChimeSMAResources"),
      handler: "createChimeSMAResources.on_event",
      runtime: lambda.Runtime.PYTHON_3_8,
      role: chimeCreateRole,
      timeout: Duration.seconds(60),
    });

    const chimeSMAProvider = new custom.Provider(this, "chimeProvider", {
      onEventHandler: createSMALambda,
    });

    const smaResources = new CustomResource(this, "smaResources", {
      serviceToken: chimeSMAProvider.serviceToken,
      properties: {
        lambdaArn: smaLambda.functionArn,
        region: this.region,
        smaName: this.stackName + "-callForward",
        phoneNumberRequired: true,
      },
    });

    smaResources.node.addDependency(smaLambda);
    const smaID = smaResources.getAttString("smaID");
    const smaPhoneNumber = smaResources.getAttString("phoneNumber");
    new cdk.CfnOutput(this, "smaPhoneNumber", { value: smaPhoneNumber });

    const handlerLambda = new lambda.Function(this, "handlerLambda", {
      code: lambda.Code.fromAsset("src/handlerLambda"),
      handler: "callForwardHandler.lambda_handler",
      runtime: lambda.Runtime.PYTHON_3_8,
      environment: {
        CallForwardingTableName: calledNumber.tableName,
        SMA_ID: smaID,
      },
      role: handlerLambdaRole,
      timeout: Duration.seconds(10),
    });
    calledNumber.grantReadWriteData(handlerLambda);

    const createVCLambda = new lambda.Function(this, "createVCLambda", {
      code: lambda.Code.fromAsset("src/createChimeVCResources"),
      handler: "createChimeVCResources.on_event",
      runtime: lambda.Runtime.PYTHON_3_8,
      role: chimeCreateRole,
      timeout: Duration.seconds(60),
    });

    const chimeVCProvider = new custom.Provider(this, "chimeVCProvider", {
      onEventHandler: createVCLambda,
    });

    const vcResources = new CustomResource(this, "outboundSMA", {
      serviceToken: chimeVCProvider.serviceToken,
      properties: {
        region: this.region,
      },
    });

    vcResources.node.addDependency(smaLambda);
    const voiceConnectorId = vcResources.getAttString("voiceConnectorId");
    const vcPhoneNumber = vcResources.getAttString("phoneNumber");
    new cdk.CfnOutput(this, "voiceConnectorId", { value: voiceConnectorId });
    new cdk.CfnOutput(this, "vcPhoneNumber", { value: vcPhoneNumber });

    const api = new apigateway.RestApi(this, "workWithChime", {
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
    });

    const updateNumber = api.root.addResource("updateNumber");
    const updateNumberIntegration = new apigateway.LambdaIntegration(
      handlerLambda
    );
    updateNumber.addMethod("POST", updateNumberIntegration, {
      methodResponses: [{ statusCode: "200" }],
    });
    updateNumber.addCorsPreflight({
      allowOrigins: ["*"],
      allowMethods: ["POST", "OPTIONS"],
    });

    const queryNumber = api.root.addResource("queryNumber");
    const queryNumberIntegration = new apigateway.LambdaIntegration(
      handlerLambda
    );
    queryNumber.addMethod("POST", queryNumberIntegration, {
      methodResponses: [{ statusCode: "200" }],
    });
    queryNumber.addCorsPreflight({
      allowOrigins: ["*"],
      allowMethods: ["POST", "OPTIONS"],
    });

    const listVoiceConnectors = api.root.addResource("listVoiceConnectors");
    const listVoiceConnectorsIntegration = new apigateway.LambdaIntegration(
      handlerLambda
    );
    listVoiceConnectors.addMethod("POST", listVoiceConnectorsIntegration, {
      methodResponses: [{ statusCode: "200" }],
    });
    listVoiceConnectors.addCorsPreflight({
      allowOrigins: ["*"],
      allowMethods: ["POST", "OPTIONS"],
    });

    new cdk.CfnOutput(this, "chimeAPI", { value: api.url });
  }
}
