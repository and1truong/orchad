// Original vectors from RFC3986 Appendix A. Generic URI syntax does not impose
// DNS resolution, an HTTP host requirement or a 65535 transport-port ceiling.
export const validAuthorityReferences = [
  'http://[::1]/answer', '//user:password@[2001:DB8::1]:8080/a?x=1#part',
  'custom://[1:2:3:4:5:6:7:8]/', 'custom://[::1:2:3:4:5:6:7]/',
  'custom://[1::2:3:4:5:6:7]/', 'custom://[1:2::3:4:5:6:7]/',
  'custom://[1:2:3::4:5:6:7]/', 'custom://[1:2:3:4::5:6:7]/',
  'custom://[1:2:3:4:5::6:7]/', 'custom://[1:2:3:4:5:6::7]/',
  'custom://[1:2:3:4:5:6:7::]/', 'custom://[::]/',
  'http://[::ffff:192.0.2.1]/', 'custom://[1:2:3:4:5:6:192.0.2.1]/',
  'scheme://[v1.future:host]/answer', 'scheme://[Vf.a!$&\'()*+,;=:]/',
  'scheme://[v123.ABC-._~]/', 'scheme://user%40name:pw@host:999999/',
  'scheme://host:/', 'scheme:///', 'scheme://@:/', '//', 'scheme:',
  '//999.999.999.999/', '//192.00.2.1/', '//name%3Apart/',
  'scheme://host/a:b@c;d?one?two/three#four?five/six',
  'relative/path:part', '/:first', './:first', 'relative%3Afirst',
  'custom:/absolute', 'custom:rootless', '?query', '#fragment',
];
export const invalidAuthorityReferences = [
  'http://[:::]/', 'http://[1:2:3:4:5:6:7]/', 'http://[1:2:3:4:5:6:7:8:9]/',
  'http://[1:2:3:4:5:6:7:8::]/', 'http://[1::2::3]/', 'http://[12345::]/',
  'http://[gggg::]/', 'http://[::ffff:256.0.2.1]/', 'http://[::ffff:192.00.2.1]/',
  'http://[::ffff:192.0.2]/', 'http://[192.0.2.1]/', 'http://[::1%25eth0]/',
  'http://[::1', 'http://::1]/', 'http://[[::1]]/', 'http://[::1]tail/',
  'http://[v.future]/', 'http://[vG.future]/', 'http://[v1.]/',
  'http://[v1.%41]/', 'http://[v1.a@b]/', 'http://[v1.a/b]/',
  'http://host:abc/', 'http://host:-1/', 'http://host:1:2/', 'http://unbracketed::1/',
  'http://a@b@host/', 'http://user[name]@host/', 'http://host]/',
  'http://host/path[part]', 'http://host/?q=[part]', 'http://host/#part[one]',
  ':first', '1scheme:part', 'relative:first:with space', 'path#one#two',
  'http://host%GG/', 'http://host/\n', 'http://host/\u0000',
];
// Historical 2nd-edition/RFC2396 compatibility: registry authorities may contain
// colon and @ as data. Full legacy structural binding remains a separate gate.
export const validLegacyAuthorityReferences = ['custom://host:abc/', 'custom://a@b@host/', 'custom://unbracketed::1/', 'custom://registry:alpha@name:part/a'];
export const invalidLegacyAuthorityReferences = invalidAuthorityReferences.filter(value => /[\[\]]/.test(value)).concat(['http://host%GG/', 'http://host/\n', 'http://host/\u0000', 'path#one#two']);
