import {createMediaProvider} from './lib/openclaw/provider-selection.mjs';

console.log('Testing createMediaProvider...');
const provider = createMediaProvider({legacyCloud:true});
console.log('Provider type:', provider.constructor.name);
console.log('Has status:', typeof provider.status === 'function');

if (typeof provider.status === 'function') {
  try {
    const status = provider.status();
    console.log('Status result:', JSON.stringify(status, null, 2));
  } catch (e) {
    console.log('Status error:', e.message);
  }
} else {
  console.log('ERROR: provider.status is NOT a function!');
  console.log('Provider keys:', Object.keys(provider));
  console.log('Provider prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(provider)));
}
