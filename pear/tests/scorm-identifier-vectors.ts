// Original vectors for the URI character/percent binding in RFC 2396 §2 and
// RFC 3986 §2; structural and scheme-specific conformance has separate gates.
export const validIdentifiers = ['a', 'answer,answer', '?answer=a&b=~', '#', 'urn:pear:answer%2C%5B%2E%5D', 'https://example.test/a%20b?q=a,b&next=/c?d#part'];
export const invalidIdentifiers = ['', ' ', 'a b', 'a\nb', 'a\r', 'a\t', 'a\u0000b', 'a%','a%2','a%GG', 'a\\b', 'a{b}', 'a<b>', 'a"b', 'a`b', 'a|b', 'a^b', 'a🙂', 'a\ud800'];
