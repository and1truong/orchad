// Original RFC 2141 §§2–2.4 vectors. Reserved /?# are SHOULD NOT, not MUST NOT.
export const validURNs = ['urn:a:a', 'UrN:Pear:answer%2cpart', 'urn:a-:a/b?c#d', 'urn:1:()+,-.:=@;$_!*\'', 'urn:' + 'a'.repeat(32) + ':answer', 'urn:pear:encoded%26%7E%5B%5D'];
export const invalidURNs = ['urn:', 'urn::answer', 'urn:pear:', 'urn:-pear:answer', 'urn:pear_name:answer', 'urn:pear.name:answer', 'urn:pear+name:answer', 'urn:urn:answer', 'URN:UrN:answer', 'urn:' + 'a'.repeat(33) + ':answer', 'urn:pear:a&b', 'urn:pear:a~b'];
