// Original RFC 2396 §3.1/§5 and RFC 3986 §3.1/§4.2 vectors.
// Relative references remain admitted; no normalization or scheme registry policy.
export const validSchemeReferences = ['custom:item', 'Custom+V1.2-:opaque', 'mailto:user@example.test', './1:identifier', '../bad_scheme:identifier', 'dir/1:identifier', '/:identifier', '//example.test/path:part', 'name?query:value', 'name#fragment:value', 'relative-name'];
export const invalidSchemeReferences = ['1:identifier', ':identifier', '+x:identifier', '-x:identifier', '.x:identifier', 'bad_scheme:identifier', 'bad~scheme:identifier', 'a%20b:identifier', 'a@b:identifier'];
