import { App, CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  PSTNAudio,
  Infrastructure,
  Cognito,
  Site,
  S3Resources,
  Database,
} from './';

export class AmazonChimeSMACallForwarding extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const allowedDomain = this.node.tryGetContext('AllowedDomain');
    const cognito = new Cognito(this, 'Cognito', {
      allowedDomain: allowedDomain,
    });

    const outgoingWav = new S3Resources(this, 'S3Resoruces');

    const database = new Database(this, 'Database');

    const chime = new PSTNAudio(this, 'PSTNAudio', {
      outgoingWav: outgoingWav.outgoingWav,
      calledNumber: database.calledNumber,
    });
    const infrastructure = new Infrastructure(this, 'Infrastructure', {
      fromPhoneNumber: chime.fromNumber,
      calledNumber: database.calledNumber,
      smaId: chime.smaId,
      userPool: cognito.userPool,
    });

    const site = new Site(this, 'Site', {
      apiUrl: infrastructure.apiUrl,
      userPool: cognito.userPool,
      userPoolClient: cognito.userPoolClient,
      identityPool: cognito.identityPool,
    });

    new CfnOutput(this, 'API_URL', { value: infrastructure.apiUrl });
    new CfnOutput(this, 'USER_POOL_REGION', { value: cognito.userPoolRegion });
    new CfnOutput(this, 'USER_POOL_ID', { value: cognito.userPool.userPoolId });
    new CfnOutput(this, 'USER_POOL_CLIENT', {
      value: cognito.userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, 'siteBucket', { value: site.siteBucket.bucketName });
    new CfnOutput(this, 'site', {
      value: site.distribution.distributionDomainName,
    });
  }
}

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const app = new App();

new AmazonChimeSMACallForwarding(app, 'AmazonChimeSMACallForwarding', {
  env: devEnv,
});

app.synth();
