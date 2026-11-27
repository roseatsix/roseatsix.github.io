/* ==========================================================
   The lessons. Each lesson has parts; each part is a list of
   steps:
     { t: 'p', html }                  a paragraph (or any HTML)
     { t: 'tip', html }                a highlighted note
     { t: 'code', code, lang, label, mark, notes: [[line, text]] }
     { t: 'demo', id }                 an interactive demo (demos.js)
     { t: 'quiz', q, options, answer, why }
     { t: 'practice', id, title, task, mode: 'js' | 'web',
       start: { js, html, css }, edit: ['js'], tests, setup,
       hint, solution: { js, html, css } }
   ========================================================== */

export const LESSONS = [

/* ---------------------------------------------------------- */
{
  id: 'page',
  title: 'What a web page is made of',
  summary: 'HTML, CSS and JavaScript: the three languages behind every page here.',
  minutes: 8,
  parts: [
    { title: 'Three languages, three jobs', steps: [
      { t: 'p', html: 'Every page on rose at six is made of three languages working together. Each one has a different job:' },
      { t: 'p', html: `<ul class="l-list">
        <li><strong>HTML</strong> says <em>what</em> is on the page: a title, a button, a list.</li>
        <li><strong>CSS</strong> says how it <em>looks</em>: colours, sizes, rounded corners.</li>
        <li><strong>JavaScript</strong> (JS) says what it <em>does</em>: what happens when you tap, type or open a page.</li></ul>` },
      { t: 'tip', html: 'Think of a person: HTML is the skeleton, CSS is the clothes, and JavaScript is the muscles that make it move.' },
      { t: 'demo', id: 'layers' },
    ] },
    { title: 'Reading HTML', steps: [
      { t: 'p', html: 'This is (a simpler version of) one of the cards on your hub:' },
      { t: 'code', lang: 'html', code: `<a class="card" href="tools/journal/">
  <h3>Journal</h3>
  <p>Tasks, log, calendars.</p>
</a>`, notes: [
        [1, '<code>&lt;a&gt;</code> is a link. <code>href</code> says where it goes. <code>class="card"</code> is a name tag, so CSS can find it later.'],
        [2, '<code>&lt;h3&gt;</code> is a heading. Text goes between the opening tag and the closing tag (the one with <code>/</code>).'],
        [3, '<code>&lt;p&gt;</code> is a paragraph.'],
        [4, 'The closing tag. Everything between line 1 and here is <em>inside</em> the link, so the whole card is tappable.'],
      ] },
      { t: 'p', html: 'Tags wrap around things like boxes inside boxes. The card box holds a heading box and a paragraph box.' },
    ] },
    { title: 'Reading CSS', steps: [
      { t: 'code', lang: 'css', code: `.card {
  padding: 16px;
  border-radius: 16px;
  background: #F6EDE6;
}
.card h3 {
  color: #A65D52;
}`, notes: [
        [1, '<code>.card</code> means "everything with class card". The dot means class.'],
        [2, 'Space inside the box, between its edge and its content.'],
        [3, 'How rounded the corners are. This is the "moderately rounded" look you asked for.'],
        [4, 'A colour written as a hex code: two digits each for red, green and blue.'],
        [6, '<code>.card h3</code> means "an h3 that is inside a .card". The space means "inside".'],
      ] },
      { t: 'tip', html: 'On the real site the colours aren\'t typed in each place. They are named once (like <code>--flower</code>) and reused everywhere. That\'s how one tap in Appearance can repaint every page.' },
      { t: 'practice', id: 'card', title: 'Make the card yours', mode: 'web', edit: ['html', 'css'],
        task: 'Change the title to <strong>Garden</strong>, add a second paragraph under the first one, and give the title a different colour.',
        start: {
          html: `<a class="card" href="#">
  <h3>Journal</h3>
  <p>Tasks, log, calendars.</p>
</a>`,
          css: `.card {
  display: block;
  padding: 16px;
  border-radius: 16px;
  background: #F6EDE6;
  color: #3B302B;
  text-decoration: none;
}
.card h3 {
  margin: 0 0 4px;
  color: #A65D52;
}`,
        },
        tests: `
check('The title says Garden', () => ($('.card h3') && $('.card h3').textContent.trim() === 'Garden') || 'The title says "' + ($('.card h3') ? $('.card h3').textContent.trim() : '?') + '".');
check('There are two paragraphs in the card', () => $$('.card p').length >= 2 || 'I found ' + $$('.card p').length + ' paragraph(s) inside the card.');
check('The title has a new colour', () => !$('.card h3') ? 'There is no title.' : getComputedStyle($('.card h3')).color !== 'rgb(166, 93, 82)' || 'The title is still the old colour. Change the color inside ".card h3 { }".');`,
        hint: 'A new paragraph is another <code>&lt;p&gt;…&lt;/p&gt;</code> line, still before <code>&lt;/a&gt;</code>. For the colour, change <code>#A65D52</code> to another colour, like <code>#7F8E6B</code> or simply <code>green</code>.',
        solution: {
          html: `<a class="card" href="#">
  <h3>Garden</h3>
  <p>Tasks, log, calendars.</p>
  <p>Grows a little every day.</p>
</a>`,
          css: `.card {
  display: block;
  padding: 16px;
  border-radius: 16px;
  background: #F6EDE6;
  color: #3B302B;
  text-decoration: none;
}
.card h3 {
  margin: 0 0 4px;
  color: #7F8E6B;
}`,
        } },
      { t: 'quiz', q: 'You want every button to have rounder corners. Which language do you change?', options: ['HTML', 'CSS', 'JavaScript'], answer: 1, why: 'Rounded corners are about how things look, and that is CSS\'s job.' },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'functions',
  title: 'Functions, slowly',
  summary: 'What a function really is, how to call one, and why "return" matters.',
  minutes: 15,
  parts: [
    { title: 'A function is a recipe', steps: [
      { t: 'p', html: 'A function is a <strong>recipe card</strong>. Writing the card doesn\'t cook anything. Cooking only happens when someone <em>uses</em> the card.' },
      { t: 'code', code: `function double(n) {
  return n * 2;
}`, label: 'Writing the recipe (defining)', notes: [
        [1, '<code>function</code> says "here comes a recipe". <code>double</code> is its name. <code>n</code> is a blank to fill in later, called a <strong>parameter</strong>.'],
        [2, '<code>return</code> hands the result back to whoever used the recipe. Here: whatever n is, times 2.'],
        [3, 'The recipe ends. Nothing has happened yet!'],
      ] },
      { t: 'code', code: `double(4);              // 8
const big = double(50); // big is now 100`, label: 'Using the recipe (calling)', notes: [
        [1, 'The brackets <code>()</code> mean "cook it now". 4 goes into the blank, so inside the recipe <code>n</code> is 4.'],
        [2, 'What <code>return</code> hands back can be stored in a box (a variable) for later.'],
      ] },
      { t: 'tip', html: '<strong>No brackets, no cooking.</strong> <code>double</code> is the recipe card itself. <code>double(4)</code> is the dish.' },
      { t: 'quiz', q: 'What is <code>double(double(3))</code>?', options: ['6', '9', '12', 'An error'], answer: 2, why: 'Work from the inside out: double(3) gives 6, then double(6) gives 12.' },
    ] },
    { title: 'Watch one run', steps: [
      { t: 'p', html: 'This is the function that greets you on the hub (written a little longer, so it\'s easier to follow). Slide the hour and watch which lines run.' },
      { t: 'demo', id: 'greeting' },
      { t: 'p', html: 'Notice: as soon as a <code>return</code> runs, the function <strong>stops</strong>. The lines below it are skipped. That\'s why the order of the <code>if</code>s matters.' },
    ] },
    { title: 'Your turn', steps: [
      { t: 'practice', id: 'triple', title: 'Your first function', mode: 'js',
        task: 'Write a function called <code>triple</code> that takes a number and gives back that number times 3.',
        start: { js: `function triple(n) {
  // your code here
}

console.log(triple(5)); // should show 15` },
        tests: `
check('triple(2) is 6', () => gives('triple(2)', triple(2), 6));
check('triple(0) is 0', () => gives('triple(0)', triple(0), 0));
check('triple(-4) is -12', () => gives('triple(-4)', triple(-4), -12));`,
        hint: 'Look at <code>double</code> above: it\'s almost the same. Inside the curly brackets, <code>return</code> the number times 3.',
        solution: { js: `function triple(n) {
  return n * 3;
}

console.log(triple(5)); // 15` } },
      { t: 'p', html: '<strong>return vs console.log.</strong> Both seem to "show" a value, but they are very different. <code>console.log</code> writes on the screen <em>for you to read</em>. <code>return</code> hands the value back <em>to the code</em> that called the function, so it can keep using it. A function that only logs gives back nothing (<code>undefined</code>).' },
      { t: 'practice', id: 'greeting', title: 'Greet the hour', mode: 'js',
        task: 'Write <code>greeting(hour)</code> like the hub\'s: before 12 → <code>"Good morning"</code>, before 17 → <code>"Good afternoon"</code>, before 21 → <code>"Good evening"</code>, otherwise <code>"Good night"</code>.',
        start: { js: `function greeting(hour) {
  if (hour < 12) {
    return 'Good morning';
  }
  // add the rest here
}

console.log(greeting(9));
console.log(greeting(15));` },
        tests: `
for (const [h, want] of [[9, 'Good morning'], [0, 'Good morning'], [12, 'Good afternoon'], [16, 'Good afternoon'], [17, 'Good evening'], [20, 'Good evening'], [21, 'Good night'], [23, 'Good night']]) {
  check('greeting(' + h + ') is "' + want + '"', () => gives('greeting(' + h + ')', greeting(h), want));
}`,
        hint: 'Add two more <code>if</code>s, one for <code>hour &lt; 17</code> and one for <code>hour &lt; 21</code>. The last line needs no <code>if</code> at all: if the function got that far, it must be night.',
        solution: { js: `function greeting(hour) {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  if (hour < 21) {
    return 'Good evening';
  }
  return 'Good night';
}` } },
      { t: 'practice', id: 'price', title: 'Two blanks', mode: 'js',
        task: 'A recipe can have more than one blank. Write <code>fullPrice(price, qty)</code> that gives back the price times the quantity. (The inventory does this for "estimated value".)',
        start: { js: `function fullPrice(price, qty) {

}

console.log(fullPrice(45000, 2)); // should show 90000` },
        tests: `
check('fullPrice(45000, 2) is 90000', () => gives('fullPrice(45000, 2)', fullPrice(45000, 2), 90000));
check('fullPrice(10, 0) is 0', () => gives('fullPrice(10, 0)', fullPrice(10, 0), 0));
check('The order of the blanks is right', () => gives('fullPrice(3, 5)', fullPrice(3, 5), 15));`,
        hint: 'The blanks are separated by a comma. Inside, both names can be used: <code>return price * qty;</code>',
        solution: { js: `function fullPrice(price, qty) {
  return price * qty;
}` } },
    ] },
    { title: 'The short way: arrow functions', steps: [
      { t: 'p', html: 'You\'ll see functions written like this all over the site. It\'s the same recipe, just a shorter way to write it:' },
      { t: 'code', code: `// the long way
function double(n) {
  return n * 2;
}

// the short way (an "arrow function")
const double = n => n * 2;`, notes: [
        [7, 'Read <code>=&gt;</code> as "becomes". "n becomes n times 2". When there are no curly brackets, the <code>return</code> is automatic.'],
      ] },
      { t: 'p', html: 'With two blanks, put them in brackets: <code>const fullPrice = (price, qty) =&gt; price * qty;</code>' },
      { t: 'practice', id: 'arrow', title: 'Write one the short way', mode: 'js',
        task: 'Write <code>half</code> as an arrow function that gives back a number divided by 2.',
        start: { js: `const half = // finish this line

console.log(half(10)); // should show 5` },
        tests: `
check('half(10) is 5', () => gives('half(10)', half(10), 5));
check('half(3) is 1.5', () => gives('half(3)', half(3), 1.5));
check('It is an arrow function', () => String(half).includes('=>') || 'It works! Now try writing it with =>.');`,
        hint: 'Follow the pattern <code>const double = n =&gt; n * 2;</code>, but divide instead of multiply.',
        solution: { js: `const half = n => n / 2;

console.log(half(10)); // 5` } },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'data',
  title: 'Lists and labelled boxes',
  summary: 'How your tasks are stored, and how to pick out the ones you need.',
  minutes: 15,
  parts: [
    { title: 'Objects: labelled boxes', steps: [
      { t: 'p', html: 'Every task in your journal is an <strong>object</strong>: one box with labelled compartments.' },
      { t: 'code', code: `const task = {
  title: 'Pay electricity',
  due: '2026-11-26',
  done: false,
};

task.title;   // 'Pay electricity'
task.done = true;`, notes: [
        [1, 'Curly brackets make an object.'],
        [2, 'Each line is <code>label: value</code>. The labels are called <strong>keys</strong>.'],
        [7, 'A dot opens one compartment.'],
        [8, 'You can change what\'s inside. Ticking a task in the journal does exactly this, then saves.'],
      ] },
    ] },
    { title: 'Arrays: lists in order', steps: [
      { t: 'code', code: `const tasks = [
  { title: 'Pay electricity', done: false },
  { title: 'Buy flowers', done: true },
  { title: 'Call mum', done: false },
];

tasks.length;    // 3
tasks[0].title;  // 'Pay electricity'`, notes: [
        [1, 'Square brackets make a list (an <strong>array</strong>). Here it holds three task objects.'],
        [7, 'How many things are in the list.'],
        [8, 'Counting starts at <strong>0</strong>, so the first one is <code>[0]</code>.'],
      ] },
    ] },
    { title: 'Giving a function to a function', steps: [
      { t: 'p', html: 'Here\'s where functions show up again, and where they often get confusing. To get only the open tasks, the site does this:' },
      { t: 'code', code: `const open = tasks.filter(t => !t.done);`, notes: [
        [1, '<code>filter</code> goes through the list one task at a time. For each one it asks your little function "keep this one?". Your function answers true (keep) or false (skip). <code>!</code> means "not", so it keeps tasks that are not done.'],
      ] },
      { t: 'tip', html: 'You don\'t call <code>t =&gt; !t.done</code> yourself. You <em>hand the recipe</em> to filter, and filter cooks it once per task, filling the blank <code>t</code> with each task in turn.' },
      { t: 'demo', id: 'filter' },
      { t: 'p', html: '<code>map</code> is filter\'s sibling: instead of keeping or skipping, it turns every item into something new. <code>tasks.map(t =&gt; t.title)</code> gives <code>[\'Pay electricity\', \'Buy flowers\', \'Call mum\']</code>.' },
    ] },
    { title: 'Your turn', steps: [
      { t: 'practice', id: 'open', title: 'Only the open tasks', mode: 'js',
        task: 'Write <code>openTasks(list)</code> that gives back only the tasks that are not done.',
        start: { js: `const tasks = [
  { title: 'Pay electricity', done: false },
  { title: 'Buy flowers', done: true },
  { title: 'Call mum', done: false },
];

function openTasks(list) {

}

console.log(openTasks(tasks));` },
        tests: `
const T = [{ title: 'A', done: false }, { title: 'B', done: true }, { title: 'C', done: false }, { title: 'D', done: true }];
check('It keeps A and C', () => { const r = openTasks(T); return r === undefined ? gives('openTasks(list)', r, []) : same(r.map(t => t.title), ['A', 'C']) || 'It gave back ' + __show(r.map(t => t.title), 1) + '.'; });
check('An empty list gives an empty list', () => gives('openTasks([])', openTasks([]), []));`,
        hint: 'One line is enough: <code>return list.filter(t =&gt; …);</code>. Fill in the question that should be true for tasks you want to keep.',
        solution: { js: `function openTasks(list) {
  return list.filter(t => !t.done);
}` } },
      { t: 'practice', id: 'titles', title: 'Just the titles', mode: 'js',
        task: 'Write <code>titles(list)</code> that gives back a list of just the titles.',
        start: { js: `function titles(list) {

}

console.log(titles([{ title: 'Tea', done: true }, { title: 'Walk', done: false }]));` },
        tests: `
check('It gives the titles in order', () => gives('titles(...)', titles([{ title: 'Tea' }, { title: 'Walk' }]), ['Tea', 'Walk']));`,
        hint: 'This is a job for <code>map</code>: turn each task <code>t</code> into <code>t.title</code>.',
        solution: { js: `function titles(list) {
  return list.map(t => t.title);
}` } },
      { t: 'practice', id: 'count', title: 'Count the done ones', mode: 'js',
        task: 'Write <code>countDone(list)</code> that gives back <em>how many</em> tasks are done. (The week view shows this as "2/5 tasks done".)',
        start: { js: `function countDone(list) {

}` },
        tests: `
check('Two done out of three', () => gives('countDone(...)', countDone([{ done: true }, { done: false }, { done: true }]), 2));
check('None done', () => gives('countDone([{ done: false }])', countDone([{ done: false }]), 0));`,
        hint: 'Filter first, then ask the result for its <code>.length</code>. You can chain them: <code>list.filter(…).length</code>.',
        solution: { js: `function countDone(list) {
  return list.filter(t => t.done).length;
}

// Another way, with a loop:
// function countDone(list) {
//   let n = 0;
//   for (const t of list) {
//     if (t.done) n = n + 1;
//   }
//   return n;
// }` } },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'react',
  title: 'Making the page react',
  summary: 'Find things on the page, listen for taps, and change what you see.',
  minutes: 15,
  parts: [
    { title: 'Find, listen, change', steps: [
      { t: 'p', html: 'Almost everything interactive on the site follows the same three steps: <strong>find</strong> an element, <strong>listen</strong> for something to happen to it, then <strong>change</strong> the page.' },
      { t: 'code', code: `const button = document.querySelector('#log');

button.addEventListener('click', () => {
  button.textContent = 'Logged!';
});`, notes: [
        [1, '<strong>Find.</strong> <code>querySelector</code> searches the page, like Ctrl+F. <code>#log</code> means "the element with id log". (The same names CSS uses: <code>#</code> for id, <code>.</code> for class.)'],
        [3, '<strong>Listen.</strong> "When this button is clicked, run this function." The function is handed over now, and the <em>browser</em> calls it later, every time you click.'],
        [4, '<strong>Change.</strong> Put new text in the button.'],
      ] },
      { t: 'tip', html: 'This is the "giving a function to a function" idea again. <code>addEventListener</code> holds on to your recipe and cooks it whenever the click happens.' },
      { t: 'quiz', q: 'When does the code inside <code>() =&gt; { … }</code> run?', options: ['Right away, when the page loads', 'Every time the button is clicked', 'Only the first time'], answer: 1, why: 'Handing a function to addEventListener doesn\'t run it. The browser runs it on each click.' },
    ] },
    { title: 'Your turn', steps: [
      { t: 'practice', id: 'counter', title: 'A counter', mode: 'web', edit: ['js'],
        task: 'Make the button add 1 to the count each time it\'s clicked. Try it in the preview after you run it.',
        start: {
          html: `<button id="add">Add one</button>
<p>Count: <span id="count">0</span></p>`,
          js: `const button = document.querySelector('#add');
const countEl = document.querySelector('#count');
let count = 0;

// When the button is clicked:
//   add 1 to count, then show count inside countEl
`,
        },
        tests: `
check('Three clicks show 3', () => { $('#add').click(); $('#add').click(); $('#add').click(); const v = $('#count').textContent.trim(); return v === '3' || 'After 3 clicks the count shows "' + v + '".'; });`,
        hint: 'Inside <code>button.addEventListener(\'click\', () =&gt; { … })</code>: first <code>count = count + 1;</code> then <code>countEl.textContent = count;</code>',
        solution: { js: `const button = document.querySelector('#add');
const countEl = document.querySelector('#count');
let count = 0;

button.addEventListener('click', () => {
  count = count + 1;
  countEl.textContent = count;
});` } },
      { t: 'p', html: 'The journal\'s "Log it" button works like the next one: read what you typed, add it to the list, then empty the box.' },
      { t: 'practice', id: 'minilog', title: 'A tiny log', mode: 'web', edit: ['js'],
        task: 'When <strong>Log it</strong> is clicked: add a new <code>&lt;li&gt;</code> with the typed text to the list, then clear the box. If the box is empty, do nothing.',
        start: {
          html: `<input id="text" placeholder="What did you just finish?">
<button id="log">Log it</button>
<ul id="list"></ul>`,
          js: `const input = document.querySelector('#text');
const button = document.querySelector('#log');
const list = document.querySelector('#list');

button.addEventListener('click', () => {
  const text = input.value;
  // 1. if text is empty, stop here (return)
  // 2. make a new <li> and put the text in it
  // 3. add it to the list
  // 4. clear the input
});`,
        },
        tests: `
check('Typing Tea and clicking adds "Tea"', () => { $('#text').value = 'Tea'; $('#log').click(); const li = $$('#list li'); return (li.length === 1 && li[0].textContent.trim() === 'Tea') || 'The list has ' + li.length + ' item(s)' + (li[0] ? ', the first says "' + li[0].textContent.trim() + '"' : '') + '.'; });
check('The box is cleared after logging', () => $('#text').value === '' || 'The box still says "' + $('#text').value + '".');
check('An empty box adds nothing', () => { const before = $$('#list li').length; $('#text').value = ''; $('#log').click(); return $$('#list li').length === before || 'Clicking with an empty box still added an item.'; });`,
        hint: '<code>if (text === \'\') return;</code> stops early. A new item: <code>const li = document.createElement(\'li\');</code>, then <code>li.textContent = text;</code>, then <code>list.append(li);</code>. To clear: <code>input.value = \'\';</code>',
        solution: { js: `const input = document.querySelector('#text');
const button = document.querySelector('#log');
const list = document.querySelector('#list');

button.addEventListener('click', () => {
  const text = input.value;
  if (text === '') return;
  const li = document.createElement('li');
  li.textContent = text;
  list.append(li);
  input.value = '';
});` } },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'split',
  title: 'The bill splitter\'s maths',
  summary: 'Splitting evenly, splitting by item, and who pays whom.',
  minutes: 15,
  parts: [
    { title: 'Splitting a receipt', steps: [
      { t: 'p', html: 'The splitter is mostly small functions doing simple maths. Try a receipt first:' },
      { t: 'demo', id: 'receipt' },
      { t: 'p', html: 'Three rules make it work:' },
      { t: 'p', html: `<ul class="l-list">
        <li>Each item is split between the people who shared it.</li>
        <li>Service and tax are added in proportion: if you ate 40% of the food, you pay 40% of the tax.</li>
        <li>Rupiah can\'t be split into fractions, so shares are rounded, and any leftover rupiah goes to the person who paid.</li></ul>` },
    ] },
    { title: 'Your turn', steps: [
      { t: 'practice', id: 'share', title: 'Split evenly', mode: 'js',
        task: 'Write <code>share(total, people)</code> that gives back each person\'s part, rounded to a whole number.',
        start: { js: `function share(total, people) {

}

console.log(share(300000, 3)); // should show 100000
console.log(share(100000, 3)); // should show 33333` },
        tests: `
check('share(300000, 3) is 100000', () => gives('share(300000, 3)', share(300000, 3), 100000));
check('share(100000, 3) is 33333', () => gives('share(100000, 3)', share(100000, 3), 33333));
check('share(50000, 4) is 12500', () => gives('share(50000, 4)', share(50000, 4), 12500));`,
        hint: 'Divide, then round: <code>Math.round(…)</code> rounds to the nearest whole number.',
        solution: { js: `function share(total, people) {
  return Math.round(total / people);
}` } },
      { t: 'practice', id: 'items', title: 'Split by item', mode: 'js',
        task: 'Write <code>itemShares(items)</code>. Each item has a <code>price</code> and a list <code>who</code> of the people who shared it. Give back an object with how much each person owes, like <code>{ Rose: 40000, Dina: 30000, Ari: 30000 }</code>.',
        start: { js: `const items = [
  { name: 'Latte', price: 40000, who: ['Rose'] },
  { name: 'Cake', price: 60000, who: ['Dina', 'Ari'] },
];

function itemShares(items) {
  const owed = {};
  for (const item of items) {
    // how much does each person in item.who pay for this item?
    // add it to owed[person]
  }
  return owed;
}

console.log(itemShares(items));` },
        tests: `
check('The example works', () => gives('itemShares(example)', itemShares([{ price: 40000, who: ['Rose'] }, { price: 60000, who: ['Dina', 'Ari'] }]), { Rose: 40000, Dina: 30000, Ari: 30000 }));
check('Someone in two items pays for both', () => gives('itemShares(two items)', itemShares([{ price: 10000, who: ['Rose', 'Dina'] }, { price: 6000, who: ['Rose'] }]), { Rose: 11000, Dina: 5000 }));`,
        hint: 'Inside the loop: <code>const each = item.price / item.who.length;</code> Then loop over <code>item.who</code>. For each person: <code>owed[person] = (owed[person] || 0) + each;</code> The <code>|| 0</code> means "or 0 if they have nothing yet".',
        solution: { js: `function itemShares(items) {
  const owed = {};
  for (const item of items) {
    const each = item.price / item.who.length;
    for (const person of item.who) {
      owed[person] = (owed[person] || 0) + each;
    }
  }
  return owed;
}` } },
    ] },
    { title: 'Who pays whom', steps: [
      { t: 'p', html: 'After every receipt is split, each person has paid some amount and owes some amount. The difference says who should get money back. Then the splitter repeats one simple move: <strong>the person who owes the most pays the person who is owed the most</strong>, as much as one of them needs, until everyone is square. That keeps the number of transfers small.' },
      { t: 'quiz', q: 'Rose paid Rp 300.000 and her share is Rp 156.200. What happens?', options: ['Rose owes Rp 156.200', 'Rose gets Rp 143.800 back', 'Rose is square'], answer: 1, why: 'She paid more than her share: 300.000 − 156.200 = 143.800 should come back to her.' },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'saving',
  title: 'Remembering things',
  summary: 'Turning objects into text, saving them, and waiting for the cloud.',
  minutes: 12,
  parts: [
    { title: 'Objects become text', steps: [
      { t: 'p', html: 'Storage only understands text, not objects. So before saving, the site turns objects into text with <strong>JSON</strong>, and back again when loading.' },
      { t: 'code', code: `const task = { title: 'Tea', done: false };

const text = JSON.stringify(task);
// '{"title":"Tea","done":false}'

const back = JSON.parse(text);
back.title; // 'Tea'`, notes: [
        [3, '<code>stringify</code>: object → text.'],
        [6, '<code>parse</code>: text → object again.'],
      ] },
      { t: 'p', html: 'Your browser has a small notebook called <code>localStorage</code>. It keeps text even after you close the page. The site uses it for little things, like your colour palette. Try it:' },
      { t: 'demo', id: 'storage' },
    ] },
    { title: 'Waiting for the cloud', steps: [
      { t: 'p', html: 'Your real data goes to the cloud (Firebase) so every device can see it. But the cloud is far away, so the answer doesn\'t come back instantly.' },
      { t: 'tip', html: 'It\'s like ordering at a café. You get a buzzer right away (that\'s a <strong>Promise</strong>). The coffee comes later. <code>await</code> means "wait here until the buzzer goes off, then give me the coffee".' },
      { t: 'code', code: `async function loadJournal() {
  const items = await store.load();
  render(items);
}`, notes: [
        [1, '<code>async</code> marks a function that is allowed to wait.'],
        [2, 'Without <code>await</code>, items would be the buzzer, not the data.'],
      ] },
      { t: 'practice', id: 'await', title: 'Fix the missing await', mode: 'js',
        setup: `function fetchUser() {
  return new Promise(resolve => setTimeout(() => resolve({ name: 'Rose', city: 'Bandung' }), 300));
}`,
        task: '<code>fetchUser()</code> takes a moment, like loading from the cloud. <code>getName()</code> is broken because it doesn\'t wait. Fix it so it gives back the name.',
        start: { js: `// fetchUser() is already written for you.
// It gives back a buzzer (a Promise) for { name, city }.

function getName() {
  const user = fetchUser();
  return user.name;
}

getName().then(name => console.log(name)); // should show Rose` },
        tests: `
check('getName() gives "Rose"', async () => { const p = getName(); if (!p || typeof p.then !== 'function') return 'getName() needs to be async, so others can await it.'; const v = await p; return v === undefined ? 'getName() gave back undefined. Is there an await before fetchUser()?' : gives('await getName()', v, 'Rose'); });`,
        hint: 'Two words to add: <code>async</code> before <code>function</code>, and <code>await</code> before <code>fetchUser()</code>.',
        solution: { js: `async function getName() {
  const user = await fetchUser();
  return user.name;
}

getName().then(name => console.log(name)); // Rose` } },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'secrets',
  title: 'Keeping secrets',
  summary: 'How your passphrase locks your data before it leaves the device.',
  minutes: 10,
  parts: [
    { title: 'Locking before sending', steps: [
      { t: 'p', html: 'Everything you save is <strong>encrypted on your device</strong> first. Firebase only ever receives scrambled text. Without your key, it\'s just noise, to Google and to anyone else.' },
      { t: 'p', html: `<ol class="l-list">
        <li>Your passphrase is stirred very slowly into a <strong>key</strong>. Slow on purpose, so guessing millions of passphrases takes forever.</li>
        <li>The key and your text go into a lock (AES-GCM, the same kind banks use). Out comes scrambled text.</li>
        <li>Only the scrambled text is uploaded. Your passphrase never leaves the device.</li></ol>` },
      { t: 'demo', id: 'crypto' },
      { t: 'tip', html: 'This is also why nobody can reset a forgotten passphrase, not even Google. That\'s what the recovery key is for.' },
      { t: 'quiz', q: 'Someone gets a copy of everything in your Firebase database. What can they read?', options: ['All your journal entries', 'Only the titles', 'Nothing useful, just scrambled text'], answer: 2, why: 'Without your key they only have scrambled text. They can see how many items you have and when they changed, but not what they say.' },
    ] },
    { title: 'Bonus: a toy cipher', steps: [
      { t: 'p', html: 'Real encryption is hard maths, but the idea is old. Julius Caesar shifted every letter by a fixed number. It\'s easy to break, but it\'s a nice practice with strings and loops.' },
      { t: 'practice', id: 'caesar', title: 'Shift every letter', mode: 'js',
        task: 'Write <code>shift(text)</code> that moves every letter one place forward in the alphabet (a → b, z → a). Anything that isn\'t a lowercase letter, like spaces, stays the same.',
        start: { js: `const abc = 'abcdefghijklmnopqrstuvwxyz';

function shift(text) {
  let out = '';
  for (const ch of text) {
    // find ch in abc; if it's there, add the next letter to out,
    // otherwise add ch as it is
  }
  return out;
}

console.log(shift('hello')); // should show ifmmp` },
        tests: `
check('shift("abc") is "bcd"', () => gives('shift("abc")', shift('abc'), 'bcd'));
check('z wraps round to a', () => gives('shift("zoo")', shift('zoo'), 'app'));
check('Spaces stay', () => gives('shift("hi there")', shift('hi there'), 'ij uifsf'));`,
        hint: '<code>abc.indexOf(ch)</code> gives the position of a letter, or -1 if it isn\'t one. The next letter is <code>abc[(i + 1) % 26]</code>. The <code>% 26</code> wraps 26 back round to 0.',
        solution: { js: `const abc = 'abcdefghijklmnopqrstuvwxyz';

function shift(text) {
  let out = '';
  for (const ch of text) {
    const i = abc.indexOf(ch);
    if (i === -1) {
      out = out + ch;
    } else {
      out = out + abc[(i + 1) % 26];
    }
  }
  return out;
}` } },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'sync',
  title: 'Two phones, one journal',
  summary: 'How edits on different devices come together without clashing.',
  minutes: 12,
  parts: [
    { title: 'Item by item', steps: [
      { t: 'p', html: 'You asked for sync that doesn\'t clash. Two ideas make that work:' },
      { t: 'p', html: `<ul class="l-list">
        <li><strong>Every item is saved on its own.</strong> Each task, day or subscription is a separate little file in the cloud. Editing a task on your phone and a subscription on your laptop never touch each other.</li>
        <li><strong>If the same item changed on both, compare each field to how it was before.</strong> That earlier copy is called the <em>base</em>.</li></ul>` },
      { t: 'demo', id: 'sync' },
    ] },
    { title: 'The rule, in code', steps: [
      { t: 'p', html: 'For one field, the whole rule fits in a few lines. This is the heart of <code>merge.js</code>:' },
      { t: 'code', code: `function mergeField(base, mine, theirs) {
  if (mine === base) return theirs;  // only they changed it
  if (theirs === base) return mine;  // only I changed it
  return mine;                       // both changed: keep mine
}`, notes: [
        [2, 'If my copy still matches the base, I didn\'t touch this field, so take theirs.'],
        [4, 'Both changed it. One has to win; the site keeps the one being saved now, and the other stays in version history, so nothing is lost.'],
      ] },
      { t: 'practice', id: 'merge', title: 'Merge a whole task', mode: 'js',
        task: 'Write <code>merge(base, mine, theirs)</code> for whole objects: go through every key and use <code>mergeField</code> on each.',
        start: { js: `function mergeField(base, mine, theirs) {
  if (mine === base) return theirs;
  if (theirs === base) return mine;
  return mine;
}

function merge(base, mine, theirs) {
  const result = {};
  for (const key of Object.keys(base)) {
    // result[key] = ...
  }
  return result;
}

const base   = { title: 'Tea', due: 'Mon', notes: '' };
const mine   = { title: 'Green tea', due: 'Mon', notes: '' };
const theirs = { title: 'Tea', due: 'Tue', notes: '' };
console.log(merge(base, mine, theirs)); // { title: 'Green tea', due: 'Tue', notes: '' }` },
        tests: `
check('Both edits are kept', () => gives('merge(...)', merge({ title: 'Tea', due: 'Mon', notes: '' }, { title: 'Green tea', due: 'Mon', notes: '' }, { title: 'Tea', due: 'Tue', notes: '' }), { title: 'Green tea', due: 'Tue', notes: '' }));
check('On a clash, mine wins', () => gives('merge(...)', merge({ title: 'Tea' }, { title: 'Mint' }, { title: 'Chai' }), { title: 'Mint' }));`,
        hint: 'Inside the loop: <code>result[key] = mergeField(base[key], mine[key], theirs[key]);</code> Square brackets let you use a key that\'s stored in a variable.',
        solution: { js: `function mergeField(base, mine, theirs) {
  if (mine === base) return theirs;
  if (theirs === base) return mine;
  return mine;
}

function merge(base, mine, theirs) {
  const result = {};
  for (const key of Object.keys(base)) {
    result[key] = mergeField(base[key], mine[key], theirs[key]);
  }
  return result;
}` } },
    ] },
  ],
},

/* ---------------------------------------------------------- */
{
  id: 'online',
  title: 'From files to a website',
  summary: 'Git, branches, and how a change ends up live on your site.',
  minutes: 8,
  parts: [
    { title: 'Save points and drafts', steps: [
      { t: 'p', html: 'The site is a folder of files (HTML, CSS, JS) kept on GitHub with <strong>git</strong>.' },
      { t: 'p', html: `<ul class="l-list">
        <li>A <strong>commit</strong> is a save point, like in a game: a snapshot of every file with a note saying what changed. You can always go back.</li>
        <li>A <strong>branch</strong> is a separate line of save points. I work on <code>claude/confident-archimedes-…</code>, a draft copy, so nothing I try can break your live site.</li>
        <li><strong>Merging</strong> brings one branch\'s changes into another. When you say "merge it into public", the draft's changes join <code>public</code>, the branch your site is built from.</li></ul>` },
      { t: 'tip', html: 'That\'s why you could ask to remove the Firebase config: git remembers every save point, so a file "removed" today still exists in old commits.' },
    ] },
    { title: 'The trip to your browser', steps: [
      { t: 'demo', id: 'deploy' },
      { t: 'quiz', q: 'You changed a file on the draft branch but the site looks the same. Why?', options: ['The change was lost', 'It isn\'t merged into public yet', 'Browsers never update'], answer: 1, why: 'The site is built only from public. Until the draft is merged in, the live site doesn\'t change.' },
    ] },
    { title: 'Where to go next', steps: [
      { t: 'p', html: 'You\'ve now seen every big idea behind this site: pages built from HTML, CSS and JS; functions; lists and objects; reacting to taps; saving and waiting; encryption; sync; and publishing.' },
      { t: 'p', html: `Some ways to keep going:<ul class="l-list">
        <li>Use the <strong>Playground</strong> to try things freely. Nothing can break.</li>
        <li>Open any tool, find something small you'd change, and ask me where the code for it lives. Reading real code you use every day is one of the best ways to learn.</li>
        <li>Try writing a tiny tool yourself, like a water tracker. I can review it with you.</li></ul>` },
    ] },
  ],
},
];
