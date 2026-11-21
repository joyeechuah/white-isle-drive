// What the game's scripts get from outside, for the type check (npm run typecheck): three.js r128 from cdnjs and
// the Firebase compat SDK, loaded on demand. Both are typed loosely: the check is about the game's own code.
declare const THREE: any;
interface Window { [key: string]: any }
// browser features the game checks for before using them
interface Navigator { audioSession?: any; globalPrivacyControl?: boolean }
interface Performance { memory?: any }
// elements and event targets: the game reads and sets properties across element kinds (an input's value, a
// canvas's context) without casting each lookup
interface EventTarget { [key: string]: any }
interface Element { [key: string]: any }
interface ParentNode { [key: string]: any }
