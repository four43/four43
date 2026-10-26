// Voice clip ids (spec section 12). File = audio/voice/<id>.mp3
export const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const ANIMAL_WORDS = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick', 'golden'];
export const PLURAL = { pig: 'pigs', cow: 'cows', chicken: 'chickens', sheep: 'sheep', duck: 'ducks', bunny: 'bunnies', dog: 'dogs', chick: 'chicks' }; // F-6
export const PHRASES = { 'lets-find': "Let's find", animals: 'animals!', 'great-job': 'Great job!', 'go-to-barn': 'Go to the barn!', 'lets-count': "Let's count!", hooray: 'Hooray!', 'you-did-it': 'You did it!', 'new-sticker': 'You got a sticker!', plus: 'plus', makes: 'makes', sleepy: 'The animals are sleepy.', goodnight: 'Goodnight!', 'wake-up': 'Wake up!' };
export const WORDS = [...new Set([...NUMBER_WORDS, ...ANIMAL_WORDS, ...Object.values(PLURAL), ...Object.keys(PHRASES)])];
export const textOf = id => PHRASES[id] ?? (id[0].toUpperCase() + id.slice(1));
