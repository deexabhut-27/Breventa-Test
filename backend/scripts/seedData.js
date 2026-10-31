// Sample question bank: 30 Easy, 20 Medium, 10 Hard/Tricky (60 total).
// Format: [text, [A, B, C, D], correctIndex, explanation]
const QA = 'Quantitative Aptitude';
const LR = 'Logical Reasoning';
const VA = 'Verbal Ability';
const AR = 'Analytical Reasoning';
const GA = 'General Aptitude';

const easy = {
  [QA]: [
    ['If 5 pens cost Rs 60, what is the cost of 8 pens?', ['Rs 84', 'Rs 96', 'Rs 100', 'Rs 108'], 1, 'One pen costs 60/5 = 12, so 8 pens cost 96.'],
    ['What is 15% of 240?', ['32', '36', '38', '40'], 1, '0.15 x 240 = 36.'],
    ['A train travels 180 km in 3 hours. What is its average speed?', ['50 km/h', '55 km/h', '60 km/h', '65 km/h'], 2, '180 / 3 = 60 km/h.'],
    ['What is the average of 12, 18, 24 and 30?', ['19', '20', '21', '22'], 2, 'Sum is 84; 84 / 4 = 21.'],
    ['What is the simple interest on Rs 5,000 at 8% per annum for 2 years?', ['Rs 600', 'Rs 700', 'Rs 800', 'Rs 900'], 2, 'SI = 5000 x 8 x 2 / 100 = 800.'],
    ['The ratio of boys to girls in a class is 3:2. If there are 30 boys, how many girls are there?', ['15', '18', '20', '25'], 2, '3 parts = 30, so 1 part = 10 and girls = 2 x 10 = 20.'],
  ],
  [LR]: [
    ['Find the next number in the series: 2, 4, 8, 16, ?', ['24', '30', '32', '36'], 2, 'Each term doubles: 16 x 2 = 32.'],
    ['Which word does not belong to the group?', ['Apple', 'Mango', 'Carrot', 'Banana'], 2, 'Carrot is a vegetable; the others are fruits.'],
    ['If CAT is coded as DBU, how is DOG coded?', ['EPH', 'EPG', 'DPH', 'FQI'], 0, 'Each letter shifts forward by one: D>E, O>P, G>H.'],
    ['Find the next letter in the series: A, C, E, G, ?', ['H', 'I', 'J', 'K'], 1, 'Letters skip one each time: G + 2 = I.'],
    ['Find the odd one out.', ['3', '7', '9', '11'], 2, '9 is not a prime number; the others are.'],
    ['Book is to Reading as Fork is to:', ['Drawing', 'Writing', 'Eating', 'Stirring'], 2, 'A book is used for reading; a fork is used for eating.'],
  ],
  [VA]: [
    ["Choose the synonym of 'Abundant'.", ['Scarce', 'Plentiful', 'Rare', 'Tiny'], 1, 'Abundant means existing in large quantities: plentiful.'],
    ["Choose the antonym of 'Ancient'.", ['Old', 'Modern', 'Antique', 'Historic'], 1, 'The opposite of ancient is modern.'],
    ['Fill in the blank: She ___ to the market yesterday.', ['go', 'goes', 'went', 'gone'], 2, "'Yesterday' requires the simple past tense: went."],
    ['Which word is spelled correctly?', ['Accomodate', 'Accommodate', 'Acommodate', 'Acomodate'], 1, 'Accommodate has a double c and a double m.'],
    ["Choose the synonym of 'Brief'.", ['Short', 'Lengthy', 'Detailed', 'Slow'], 0, 'Brief means short in duration or length.'],
    ['Fill in the blank: He is good ___ mathematics.', ['in', 'at', 'on', 'with'], 1, "The correct collocation is 'good at'."],
  ],
  [AR]: [
    ['In a row of 20 students, Ravi is 7th from the left. What is his position from the right?', ['12th', '13th', '14th', '15th'], 2, 'Position from right = 20 - 7 + 1 = 14.'],
    ['If today is Monday, what day will it be after 10 days?', ['Wednesday', 'Thursday', 'Friday', 'Tuesday'], 1, '10 mod 7 = 3; three days after Monday is Thursday.'],
    ['A is taller than B, and B is taller than C. Who is the shortest?', ['A', 'B', 'C', 'Cannot be determined'], 2, 'A > B > C, so C is the shortest.'],
    ['How many triangles are formed when one diagonal is drawn in a square?', ['1', '2', '3', '4'], 1, 'One diagonal divides a square into two triangles.'],
    ['A person facing North turns 90 degrees clockwise twice. Which direction is the person facing now?', ['East', 'West', 'South', 'North'], 2, 'North > East > South.'],
    ['If 1 January 2025 is a Wednesday, what day is 8 January 2025?', ['Tuesday', 'Wednesday', 'Thursday', 'Friday'], 1, 'Seven days later is the same weekday.'],
  ],
  [GA]: [
    ['How many minutes are there in 3.5 hours?', ['180', '200', '210', '240'], 2, '3.5 x 60 = 210.'],
    ['Which of the following numbers is the largest?', ['0.5', '0.45', '0.505', '0.055'], 2, '0.505 > 0.500 > 0.450 > 0.055.'],
    ['What is the value of 2 raised to the power 5?', ['16', '25', '32', '64'], 2, '2 x 2 x 2 x 2 x 2 = 32.'],
    ['What is the angle between the hour and minute hands of a clock at 3:00?', ['60 degrees', '90 degrees', '120 degrees', '180 degrees'], 1, 'Each hour mark is 30 degrees; 3 x 30 = 90.'],
    ['How many days are there in a leap year?', ['364', '365', '366', '367'], 2, 'A leap year has 366 days.'],
    ['If a dozen eggs cost Rs 72, what is the cost of one egg?', ['Rs 5', 'Rs 6', 'Rs 7', 'Rs 8'], 1, '72 / 12 = 6.'],
  ],
};

const medium = {
  [QA]: [
    ['A shopkeeper buys an article for Rs 800 and sells it for Rs 1,000. What is the profit percentage?', ['20%', '22.5%', '25%', '30%'], 2, 'Profit 200 on cost 800 = 25%.'],
    ['Two pipes can fill a tank in 12 hours and 15 hours respectively. How long will they take to fill it together?', ['6 hours', '6 hours 40 minutes', '7 hours', '7 hours 30 minutes'], 1, '1/12 + 1/15 = 9/60, so time = 60/9 h = 6 h 40 min.'],
    ['What is the compound interest on Rs 10,000 at 10% per annum for 2 years, compounded annually?', ['Rs 2,000', 'Rs 2,050', 'Rs 2,100', 'Rs 2,200'], 2, 'Amount = 10000 x 1.21 = 12100; CI = 2100.'],
    ['A can finish a job in 10 days and B in 15 days. Working together, how many days will they take?', ['5', '6', '7', '8'], 1, '1/10 + 1/15 = 1/6, so 6 days.'],
  ],
  [LR]: [
    ['Find the next number: 3, 6, 11, 18, 27, ?', ['36', '37', '38', '39'], 2, 'Differences are 3, 5, 7, 9, 11; 27 + 11 = 38.'],
    ["If 'PAINT' is coded as 'TNIAP', how is 'BRUSH' coded?", ['HSURB', 'HRUSB', 'BSURH', 'HSUBR'], 0, 'The word is written in reverse.'],
    ['Statements: All doctors are graduates. Some graduates are players. Conclusions: I. Some doctors are players. II. Some players are graduates.', ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows'], 1, 'II is the converse of the second statement; I does not necessarily follow.'],
    ['Find the missing term: AZ, BY, CX, ?', ['DV', 'DW', 'EW', 'DX'], 1, 'First letter moves forward, second moves backward: D and W.'],
  ],
  [VA]: [
    ["Choose the word closest in meaning to 'Ephemeral'.", ['Lasting', 'Short-lived', 'Eternal', 'Ancient'], 1, 'Ephemeral means lasting a very short time.'],
    ["Identify the part with an error: 'Neither of the boys / have completed / their homework.'", ['Neither of the boys', 'have completed', 'their homework', 'No error'], 1, "'Neither' is singular, so it should be 'has completed'."],
    ["What does the idiom 'to beat around the bush' mean?", ['To avoid the main topic', 'To work very hard', 'To hit someone', 'To search thoroughly'], 0, 'It means to avoid talking about what is important.'],
    ["Choose the antonym of 'Benevolent'.", ['Kind', 'Generous', 'Malevolent', 'Charitable'], 2, 'Benevolent means well-meaning; malevolent means wishing harm.'],
  ],
  [AR]: [
    ['P, Q, R, S and T sit in a row facing North. R is in the middle, P is immediately to the left of R, T is at the extreme right, and S is not at an end. Who is at the extreme left?', ['P', 'Q', 'S', 'T'], 1, 'Order from left: Q, P, R, S, T.'],
    ['A man walks 5 km North, turns right and walks 3 km, then turns right again and walks 5 km. How far is he from the starting point?', ['3 km', '5 km', '8 km', '13 km'], 0, 'The North and South legs cancel; he is 3 km East of the start.'],
    ['In a certain month the 3rd falls on a Sunday. Which day falls on the 24th of the same month?', ['Saturday', 'Sunday', 'Monday', 'Tuesday'], 1, '24 - 3 = 21 days, a multiple of 7, so it is also Sunday.'],
    ["If 'A x B' means A is the father of B and 'A + B' means A is the sister of B, what does 'P + Q x R' mean?", ['P is the mother of R', 'P is the aunt of R', 'P is the sister of R', 'P is the grandmother of R'], 1, "P is Q's sister and Q is R's father, so P is R's paternal aunt."],
  ],
  [GA]: [
    ['What is the angle between the hands of a clock at 4:20?', ['0 degrees', '5 degrees', '10 degrees', '20 degrees'], 2, 'Hour hand: 4 x 30 + 20 x 0.5 = 130; minute hand: 120; difference 10.'],
    ['What is the LCM of 12, 18 and 30?', ['90', '120', '180', '360'], 2, 'LCM = 2^2 x 3^2 x 5 = 180.'],
    ['A number increased by 20% becomes 360. What is the number?', ['280', '288', '300', '320'], 2, '1.2x = 360, so x = 300.'],
    ['What is the unit digit of 7 raised to the power 23?', ['1', '3', '7', '9'], 1, 'Unit digits of powers of 7 cycle 7, 9, 3, 1; 23 mod 4 = 3, giving 3.'],
  ],
};

const hard = {
  [QA]: [
    ['A sum of money doubles itself in 8 years at simple interest. In how many years will it become four times itself?', ['16', '20', '24', '32'], 2, 'Rate = 12.5% p.a.; to gain 3 times the principal needs 3 / 0.125 = 24 years.'],
    ['A boat covers 30 km downstream in 2 hours and the same distance upstream in 3 hours. What is the speed of the stream?', ['2 km/h', '2.5 km/h', '3 km/h', '5 km/h'], 1, 'Downstream 15, upstream 10; stream = (15 - 10) / 2 = 2.5 km/h.'],
  ],
  [LR]: [
    ['Find the next number: 2, 3, 5, 9, 17, 33, ?', ['57', '63', '65', '66'], 2, 'Differences double: 1, 2, 4, 8, 16, 32; 33 + 32 = 65.'],
    ['Statements: Some cats are dogs. No dog is a bird. Conclusions: I. Some cats are not birds. II. No cat is a bird.', ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows'], 0, 'The cats that are dogs cannot be birds, so I follows; II is not certain.'],
  ],
  [VA]: [
    ["Choose the word that best completes the sentence: 'His ___ remarks offended everyone at the meeting, though he insisted they were merely candid.'", ['tactful', 'acerbic', 'laudatory', 'diffident'], 1, 'Acerbic means sharp and forthright, which fits remarks that offend.'],
    ["Choose the word most nearly OPPOSITE in meaning to 'Obsequious'.", ['Servile', 'Fawning', 'Assertive', 'Submissive'], 2, 'Obsequious means excessively eager to please; assertive is the opposite attitude.'],
  ],
  [AR]: [
    ['A cube painted red on all faces is cut into 27 identical smaller cubes. How many smaller cubes have exactly two painted faces?', ['6', '8', '12', '24'], 2, 'Two-face cubes lie on the edges: 12 edges x 1 cube each = 12.'],
    ['In a family, A and B are a married couple and A is male. C is the brother of A. B is the daughter-in-law of F, a widow. How is F related to C?', ['Grandmother', 'Mother', 'Aunt', 'Sister'], 1, "B is F's daughter-in-law, so A is F's son; C is A's brother, so F is C's mother."],
  ],
  [GA]: [
    ['How many times do the hour and minute hands of a clock coincide in 24 hours?', ['21', '22', '23', '24'], 1, 'They coincide 11 times every 12 hours, so 22 times a day.'],
    ["A son's present age is two-fifths of his mother's age. After 8 years he will be half her age. What is the mother's present age?", ['32', '36', '40', '48'], 2, '2M/5 + 8 = (M + 8)/2 gives M/10 = 4, so M = 40.'],
  ],
};

function expand(group, difficulty) {
  return Object.entries(group).flatMap(([category, list]) =>
    list.map(([text, options, correctOptionIndex, explanation]) => ({
      text,
      options,
      correctOptionIndex,
      explanation,
      category,
      difficulty,
      marks: difficulty === 'EASY' ? 1 : difficulty === 'MEDIUM' ? 2 : 3,
      negativeMarks: difficulty === 'EASY' ? 0.25 : difficulty === 'MEDIUM' ? 0.5 : 1,
      isActive: true,
    })),
  );
}

export const sampleQuestions = [...expand(easy, 'EASY'), ...expand(medium, 'MEDIUM'), ...expand(hard, 'HARD')];

export const defaultExam = {
  title: 'Campus Placement Aptitude Test',
  description: 'Online aptitude and logical reasoning examination for final-year placement eligibility.',
  instructions: [
    'Ensure a stable internet connection and keep your device charged before starting.',
    'Do not switch tabs, minimise the browser, or open other applications during the examination.',
    'Your answers are saved automatically every time you select an option.',
    'The timer is controlled by the server and continues even if you close or refresh the page.',
    'The examination is submitted automatically when the timer reaches zero.',
  ].join('\n'),
  durationMinutes: 60,
  distribution: { easy: 30, medium: 20, hard: 10 },
  markingScheme: 'EXAM',
  marksPerQuestion: 1,
  negativeMarking: { enabled: true, marks: 0.25 },
  passPercentage: 40,
  violationPolicy: { mode: 'STRICT', warningsAllowed: 1, heartbeatTimeoutSeconds: 45, disconnectAction: 'FLAG', maxDisconnectSeconds: 300 },
  maxAttempts: 1,
};
