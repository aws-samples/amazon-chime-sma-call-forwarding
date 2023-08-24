import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AmazonChimeSMACallForwarding } from '../src/amazon-chime-sma-call-forwarding';

test('Snapshot', () => {
  const app = new App();
  const stack = new AmazonChimeSMACallForwarding(app, 'test');

  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});
