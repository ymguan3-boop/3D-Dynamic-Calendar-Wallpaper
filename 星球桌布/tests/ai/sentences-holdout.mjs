// T02 保留測試集：在依主測試集調整「把…」句型規則「之後」才寫的新句子，用來檢查調整有沒有只對測試句過度配合。
// 這些句子沒有被用來調整任何規則。
export const HOLDOUT = [
  ['把週五的聚餐改到下週一晚上七點', 'calendar_update'],
  ['把下午的會議延到四點', 'calendar_update'],
  ['幫我把面試移到後天上午十點', 'calendar_update'],
  ['把看牙改到下個月三號', 'calendar_update'],
  ['下週二上午十點去健身', 'calendar_add'],
  ['後天晚上八點跟朋友聚會', 'calendar_add'],
  ['提醒我禮拜四交報告', 'calendar_add'],
  ['十二月十號下午兩點研習', 'calendar_add'],
  ['星期四下午有什麼行程', 'calendar_query'],
  ['下個月有哪些行程', 'calendar_query'],
  ['刪掉後天的面試', 'calendar_delete'],
  ['取消下週二的健身', 'calendar_delete'],
  ['今天是幾號', 'date_today'],
  ['說個故事給我聽', 'story'],
  ['小鳥今天在做什麼', 'residents'],
  ['關閉勿擾', 'dnd_off'],
  ['午安', 'greet'],
  ['你好可愛', 'praise'],
  ['今天心情不好', 'feeling'],
  ['明天會下雨嗎', 'outside_info'],
];
