// Voice clip ids (spec section 12). File = audio/voice/<id>.mp3
export const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const ANIMAL_WORDS = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick', 'golden'];
export const PHRASES = { 'lets-find': "Let's find", animals: 'animals!', 'great-job': 'Great job!', 'go-to-barn': 'Go to the barn!', 'lets-count': "Let's count!", hooray: 'Hooray!', 'you-did-it': 'You did it!' };
export const WORDS = [...NUMBER_WORDS.slice(1), ...ANIMAL_WORDS, ...Object.keys(PHRASES)];
export const textOf = id => PHRASES[id] ?? (id[0].toUpperCase() + id.slice(1));
