// Original vectors derived from ADL RTE 4.1.1.6 and Table 4.2.9.1a;
// no ADL suite code or commercial content is redistributed.
export const responseVectors = [
  {type: 'fill-in', patterns: [' answer ', 'red, green', 'answer, ' + '🙂'.repeat(242), 'line\nnext', '{case_matters=true}{order_matters=false}{lang=vi-VN} answer ', '{order_matters=false}{case_matters=true}{lang=en}one[,]{lang=vi-VN} hai ', ' {case_matters=true}literal'], invalid: ['answer, ' + '🙂'.repeat(243), '{case_matters=invalid}answer', '{order_matters=false}{case_matters=invalid}answer', '{case_matters=true}{order_matters=invalid}answer', '{case_matters=true}{case_matters=false}answer', '{lang=}answer']},
  {type: 'long-fill-in', patterns: [' answer ', 'red, green', 'line\nnext', '{case_matters=true}{lang=vi-VN} câu trả lời, có dấu\n ', ' {case_matters=true}literal'], invalid: ['{case_matters=invalid}answer', '{case_matters=true}{case_matters=false}answer', '{lang=}answer']},
  {type: 'performance', patterns: ['step[.] answer ', 'step[.]answer, text', '{order_matters=false}step[.] answer, text [,]next[.] line\nnext ', '{order_matters=true}[.] answer '], invalid: ['{order_matters=invalid}step[.]answer', '{order_matters=true}{order_matters=false}step[.]answer', '[.]']},
] as const;
