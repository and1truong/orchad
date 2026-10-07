/** SPM counts Unicode scalar values; transport/storage quotas remain bytes. */
export function scormCharacters(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++, count++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return Infinity;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return Infinity;
  }
  return count;
}

export const scorm12Writable = /^(?:cmi\.(?:suspend_data|comments)|cmi\.core\.(?:lesson_location|lesson_status|exit|session_time|score\.(?:raw|min|max))|cmi\.student_preference\.(?:audio|language|speed|text)|cmi\.objectives\.\d{1,3}\.(?:id|status|score\.(?:raw|min|max))|cmi\.interactions\.\d{1,3}\.(?:id|time|type|weighting|student_response|result|latency|objectives\.\d{1,3}\.id|correct_responses\.\d{1,3}\.pattern))$/;

export const scorm2004Writable = /^(?:cmi\.(?:completion_status|success_status|exit|location|progress_measure|session_time|suspend_data)|cmi\.score\.(?:scaled|raw|min|max)|cmi\.learner_preference\.(?:audio_level|language|delivery_speed|audio_captioning)|cmi\.comments_from_learner\.\d{1,3}\.(?:comment|location|timestamp)|cmi\.objectives\.\d{1,3}\.(?:id|description|completion_status|success_status|progress_measure|score\.(?:scaled|raw|min|max))|cmi\.interactions\.\d{1,3}\.(?:id|type|timestamp|weighting|learner_response|result|latency|description|objectives\.\d{1,3}\.id|correct_responses\.\d{1,3}\.pattern))$/;
