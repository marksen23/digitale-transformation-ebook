/**
 * German stopwords — words to exclude from keyword extraction.
 * Extended with common filler words found in philosophical dialogue.
 */
export const STOPWORDS_DE = new Set([
  // Articles
  "der","die","das","ein","eine","einer","eines","einem","einen",
  "den","dem","des",
  // Pronouns
  "ich","du","er","sie","es","wir","ihr","sie","mich","dich","sich",
  "uns","euch","mir","dir","ihm","ihr","ihnen","mein","dein","sein",
  "ihr","unser","euer","ihrer","meiner","deiner","seiner","unserer",
  "meinem","deinem","seinem","unserem","eurem","ihrem",
  "meinen","deinen","seinen","unseren","euren","ihren",
  "meines","deines","seines","unseres","eures","ihres",
  "dieser","diese","dieses","diesem","diesen","dieselbe","dasselbe",
  "jener","jene","jenes","jenem","jenen",
  "welcher","welche","welches","welchem","welchen",
  "man","jemand","niemand","etwas","nichts","alles","alle","jeden","jeder","jede",
  // Prepositions
  "in","an","auf","aus","bei","bis","durch","für","gegen","mit","nach",
  "seit","von","vor","zu","zwischen","über","unter","hinter","neben",
  "innerhalb","außerhalb","entlang","gegenüber","um","ab","während",
  // Conjunctions
  "und","oder","aber","doch","sondern","sowie","wie","als","ob","wenn",
  "weil","da","damit","obwohl","obgleich","nachdem","bevor","bis","seit",
  "soweit","sodass","dass","denn","nicht","kein","keine","keinen","keiner",
  // Adverbs + filler
  "auch","noch","schon","nur","sehr","so","mehr","viel","ganz","gar",
  "immer","wieder","hier","dort","da","nun","dann","also","ja","nein",
  "doch","mal","halt","eben","eigentlich","wirklich","bereits","noch",
  "bitte","gerne","zwar","jedoch","allerdings","dennoch","trotzdem",
  "hingegen","nämlich","deshalb","daher","darum","dazu","dabei","daran",
  "dafür","damit","danach","daneben","darüber","darunter","davon","dazu",
  "außerdem","zudem","zugleich","zuvor","zuerst","zunächst","schließlich",
  "einfach","natürlich","vielleicht","wahrscheinlich","sicher","bestimmt",
  "genau","gerade","fast","kaum","irgendwie","irgendwo","irgendwann",
  "womit","worüber","worunter","wobei","worum","worin","woher","wohin",
  "wozu","wofür","wonach","worauf","wovon","woran","wovor","woraus",
  // Common verbs (base and inflected forms)
  "sein","ist","war","waren","sind","bist","seid","sei","wäre","wären",
  "haben","hat","hatte","hatten","habe","hast","hatte","hatten","hätte",
  "werden","wird","wurde","wurden","werde","wirst","würde","würden",
  "können","kann","konnte","konnten","könnte","könnten",
  "müssen","muss","musste","mussten","müsste","müssten",
  "sollen","soll","sollte","sollten",
  "wollen","will","wollte","wollten",
  "dürfen","darf","durfte","durften","dürfte","dürften",
  "mögen","mag","mochte","mochten","möchte","möchten",
  "lassen","lässt","ließ","ließen",
  "gehen","geht","ging","gingen","kommt","kam","kommen",
  "machen","macht","gemacht","sagen","sagt","gesagt",
  "geben","gibt","gab","gaben","nehmen","nimmt","nahm",
  "stehen","steht","stand","standen","liegen","liegt","lag","lagen",
  "wissen","weiß","wusste","wussten","kennen","kennt","kannte",
  "denken","denkt","dachte","dachten","glauben","glaubt","glaubte",
  "sehen","sieht","sah","sahen","fühlen","fühlt","fühlte",
  "finden","findet","fand","fanden","zeigen","zeigt","zeigte",
  "bleiben","bleibt","blieb","blieben","halten","hält","hielt",
  "führen","führt","führte","stellen","stellt","stellte",
  "heißen","heißt","hieß","nennen","nennt","nannte",
  "scheinen","scheint","schien","brauchen","braucht","brauchte",
  // Common adjectives used as filler
  "gut","schlecht","groß","klein","neu","alt","lang","kurz","hoch","tief",
  "voll","leer","offen","geschlossen","weit","eng","stark","schwach",
  "erste","zweite","dritte","letzte","nächste","ganze","eigene","einzelne",
  "andere","weiterer","gewisse","solche","solcher","bestimmte",
  // Question words
  "was","wer","wen","wem","wessen","wie","wo","wann","warum","weshalb",
  "weswegen","wozu","welcher","welche","welches",
  // Numbers
  "eins","zwei","drei","vier","fünf","sechs","sieben","acht","neun","zehn",
  "einmal","zweimal","dreimal",
  // Short particles
  "je","je","te","de","le","la","un","une","les","des","du",
]);
