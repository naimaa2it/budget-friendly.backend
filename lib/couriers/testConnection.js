import { testPathaoConnection } from './createPathaoOrder.js';
import { testSteadfastConnection } from './createSteadfastOrder.js';
import { testRedxConnection } from './createRedxOrder.js';

export async function testCourierConnection(slug, creds, storeConfig) {
  switch (String(slug).toLowerCase()) {
    case 'pathao':
      return testPathaoConnection(creds, storeConfig);
    case 'steadfast':
      return testSteadfastConnection(creds, storeConfig);
    case 'redx':
      return testRedxConnection(creds, storeConfig);
    default:
      throw new Error('Courier integration not supported');
  }
}
