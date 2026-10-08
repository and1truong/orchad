// Original RFC2396 §4.1 and RFC3986 §3.5 vectors; authored escapes stay exact.
export const validFragmentReferences = ['#section', '#', 'relative#encoded%23two', 'relative?one?two#end', 'relative#one?two/part', 'https://example.test/p?q=%23#section%23two', 'urn:example:part#one%23two'];
export const invalidFragmentReferences = ['path#first#second', 'https://example.test/p?q#first#second', 'custom:part#one#two', '#one#two', 'urn:example:a#b#c'];
