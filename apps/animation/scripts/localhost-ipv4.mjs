/**
 * Remotion serves the bundle and its public files (the voice WAVs) on 127.0.0.1 but addresses them as
 * "http://localhost:<port>". On some Windows setups Node resolves "localhost" only to ::1 (IPv6), so downloading the
 * audio fails with "connect ECONNREFUSED ::1:3000". Importing this module first makes "localhost" resolve to
 * 127.0.0.1 for the current Node process only. No system settings or hosts files are touched.
 */
import dns from 'node:dns';

dns.setDefaultResultOrder('ipv4first');

const lookupOriginal = dns.lookup;
dns.lookup = function lookupLocalhostAsIPv4(hostname, options, callback) {
  if (hostname !== 'localhost') return lookupOriginal.call(this, hostname, options, callback);
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  const all = typeof options === 'object' && options !== null && options.all;
  if (all) process.nextTick(callback, null, [{ address: '127.0.0.1', family: 4 }]);
  else process.nextTick(callback, null, '127.0.0.1', 4);
};
