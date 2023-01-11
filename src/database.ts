import { RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, Table, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class Database extends Construct {
  public calledNumber: Table;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.calledNumber = new Table(this, 'calledNumber', {
      partitionKey: {
        name: 'dialed_number',
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
  }
}
