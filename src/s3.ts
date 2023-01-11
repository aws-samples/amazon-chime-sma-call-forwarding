import { RemovalPolicy } from 'aws-cdk-lib';
import { Effect, PolicyStatement, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

export class S3Resources extends Construct {
  public outgoingWav: Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.outgoingWav = new Bucket(this, 'outgoingWav', {
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const outboundWavBucketPolicy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ['s3:GetObject', 's3:PutObject', 's3:PutObjectAcl'],
      principals: [new ServicePrincipal('voiceconnector.chime.amazonaws.com')],
      resources: [
        this.outgoingWav.bucketArn,
        `${this.outgoingWav.bucketArn}/*`,
      ],
      sid: 'SIPMediaApplicationRead',
    });

    this.outgoingWav.addToResourcePolicy(outboundWavBucketPolicy);

    new BucketDeployment(this, 'WavDeploy', {
      sources: [Source.asset('./wav_files')],
      destinationBucket: this.outgoingWav,
      contentType: 'audio/wav',
    });
  }
}
