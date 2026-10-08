// Original ADL RTE 4.1.1.6 / 4.2.9 vectors. Bare punctuation is data.
export const separatorVectors = [
  {type: 'fill-in', value: 'answer, ' + '🙂'.repeat(242), invalid: 'answer, ' + '🙂'.repeat(243)},
  {type: 'performance', value: 'step[.]answer, text', invalid: 'step.answer'},
  {type: 'performance', value: 'step[.]answer\\, text', invalid: 'step.answer'},
  {type: 'choice', value: 'answer,answer', invalid: 'answer[,]answer'},
  {type: 'matching', value: 'left[.]right', invalid: 'left.right'},
] as const;
