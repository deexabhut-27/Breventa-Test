// Extra question bank so students rarely see the same paper.
// Each exam picks 10 Easy, 15 Medium and 5 Hard at random per student; with
// these the bank holds 60 Easy, 75 Medium and 30 Hard/Tricky questions.
// Format: [text, [A, B, C, D], correctIndex, explanation]
const QA = 'Quantitative Aptitude';
const LR = 'Logical Reasoning';
const VA = 'Verbal Ability';
const AR = 'Analytical Reasoning';
const GA = 'General Aptitude';

export const moreEasy = {
  [QA]: [
    ['A shirt marked Rs 800 is sold at a 25% discount. What is the selling price?', ['Rs 550', 'Rs 600', 'Rs 625', 'Rs 650'], 1, '25% of 800 is 200, so the price is 800 - 200 = 600.'],
    ['What is 3/4 of 120?', ['80', '90', '95', '100'], 1, '120 / 4 x 3 = 90.'],
    ['A car uses 8 litres of petrol to travel 120 km. How far can it travel on 20 litres?', ['240 km', '280 km', '300 km', '320 km'], 2, 'It runs 120 / 8 = 15 km per litre, so 20 x 15 = 300 km.'],
    ['What is 25% of 25% of 1,600?', ['80', '100', '120', '400'], 1, '25% of 1600 = 400, and 25% of 400 = 100.'],
    ['The sum of three consecutive numbers is 72. What is the largest of them?', ['23', '24', '25', '26'], 2, 'The numbers are 23, 24 and 25.'],
    ['A worker earns Rs 450 per day and works 6 days a week. How much does he earn in 2 weeks?', ['Rs 5,000', 'Rs 5,400', 'Rs 5,850', 'Rs 6,300'], 1, '12 working days x 450 = 5,400.'],
    ['What is the perimeter of a rectangle 12 m long and 8 m wide?', ['20 m', '40 m', '48 m', '96 m'], 1, 'Perimeter = 2 x (12 + 8) = 40 m.'],
    ['If 40% of a number is 80, what is the number?', ['160', '180', '200', '320'], 2, '0.4x = 80, so x = 200.'],
    ['A bag has 5 red and 3 blue balls. What fraction of the balls are blue?', ['3/5', '3/8', '5/8', '1/3'], 1, '3 blue out of 8 balls = 3/8.'],
  ],
  [LR]: [
    ['Find the next number: 5, 10, 15, 20, ?', ['22', '24', '25', '30'], 2, 'Add 5 each time: 20 + 5 = 25.'],
    ['Find the next number: 1, 4, 9, 16, ?', ['20', '24', '25', '36'], 2, 'These are squares: 1, 4, 9, 16, 25.'],
    ['Pen is to Write as Knife is to:', ['Cook', 'Cut', 'Sharp', 'Kitchen'], 1, 'A pen is used to write; a knife is used to cut.'],
    ['Which one does not belong to the group: Dog, Cat, Cow, Sparrow?', ['Dog', 'Cat', 'Cow', 'Sparrow'], 3, 'Sparrow is a bird; the others are mammals.'],
    ['If BOOK is coded as CPPL, how is DESK coded?', ['EFTL', 'EFSL', 'DFTL', 'EGTL'], 0, 'Each letter moves forward by one: D>E, E>F, S>T, K>L.'],
    ['Find the next letter: Z, X, V, T, ?', ['S', 'R', 'Q', 'P'], 1, 'Letters go back two at a time: T - 2 = R.'],
    ['Find the odd one out: 8, 27, 64, 100', ['8', '27', '64', '100'], 3, '8, 27 and 64 are cubes (2, 3, 4 cubed); 100 is not.'],
    ['Find the missing number: 7, 14, 28, ?, 112', ['42', '48', '56', '64'], 2, 'Each term doubles: 28 x 2 = 56.'],
    ['Doctor is to Hospital as Teacher is to:', ['Student', 'School', 'Book', 'Exam'], 1, 'A doctor works in a hospital; a teacher works in a school.'],
  ],
  [AR]: [
    ['In a queue, Meena is 5th from the front and 9th from the back. How many people are in the queue?', ['12', '13', '14', '15'], 1, 'Total = 5 + 9 - 1 = 13.'],
    ['If yesterday was Friday, what day will it be tomorrow?', ['Saturday', 'Sunday', 'Monday', 'Thursday'], 1, 'Today is Saturday, so tomorrow is Sunday.'],
    ['Ravi walks 4 km East and then 3 km North. How far is he from the start in a straight line?', ['5 km', '6 km', '7 km', '1 km'], 0, 'By Pythagoras: square root of (16 + 9) = 5 km.'],
    ['Pointing to a boy, Sita says, "He is the son of my only brother." How is the boy related to Sita?', ['Son', 'Brother', 'Nephew', 'Cousin'], 2, "Her brother's son is her nephew."],
    ['X is older than Y, and Z is older than X. Who is the youngest?', ['X', 'Y', 'Z', 'Cannot be determined'], 1, 'Z > X > Y, so Y is the youngest.'],
    ['A clock shows 6:00. If the minute hand points North, which direction does the hour hand point?', ['North', 'East', 'South', 'West'], 2, 'At 6:00 the hour hand is opposite the 12, so it points South.'],
    ['A sits to the left of B, and B sits to the left of C in a row. Who sits farthest to the right?', ['A', 'B', 'C', 'Cannot be determined'], 2, 'The order from the left is A, B, C.'],
    ['If 5 March is a Tuesday, what day is 26 March of the same year?', ['Monday', 'Tuesday', 'Wednesday', 'Sunday'], 1, '26 - 5 = 21 days, exactly 3 weeks, so it is also a Tuesday.'],
    ['You are facing South and turn 90 degrees anticlockwise. Which direction are you facing now?', ['East', 'West', 'North', 'South'], 0, 'Turning left from South faces East.'],
  ],
  [GA]: [
    ['How many months of the year have 31 days?', ['5', '6', '7', '8'], 2, 'January, March, May, July, August, October and December.'],
    ['How many seconds are there in 1 hour?', ['360', '600', '3,600', '6,000'], 2, '60 x 60 = 3,600.'],
    ['What is the square root of 144?', ['11', '12', '13', '14'], 1, '12 x 12 = 144.'],
    ['What is 1/4 written as a percentage?', ['20%', '25%', '40%', '75%'], 1, '1/4 = 0.25 = 25%.'],
    ['How many sides does a hexagon have?', ['5', '6', '7', '8'], 1, 'A hexagon has six sides.'],
    ['Which of these is a prime number?', ['21', '27', '29', '33'], 2, '29 has no factors other than 1 and itself.'],
    ['What is 9 x 12?', ['96', '98', '108', '112'], 2, '9 x 12 = 108.'],
    ['Convert 2.5 kilograms into grams.', ['250 g', '2,050 g', '2,500 g', '25,000 g'], 2, '1 kg = 1,000 g, so 2.5 kg = 2,500 g.'],
    ['How many hours are there in 3 days?', ['48', '64', '72', '96'], 2, '3 x 24 = 72.'],
  ],
};

export const moreMedium = {
  [QA]: [
    ['A sells an article to B at a 20% profit, and B sells it to C at a 10% profit. If C pays Rs 264, how much did A pay for it?', ['Rs 180', 'Rs 200', 'Rs 210', 'Rs 220'], 1, 'x x 1.2 x 1.1 = 264, so 1.32x = 264 and x = 200.'],
    ['The average of 5 numbers is 40. When one number is removed, the average becomes 35. Which number was removed?', ['50', '55', '60', '65'], 2, 'Total 200 - remaining 4 x 35 = 140, so 60 was removed.'],
    ['A train 150 m long passes a pole in 10 seconds. What is its speed in km/h?', ['45', '50', '54', '60'], 2, '150 / 10 = 15 m/s; 15 x 18/5 = 54 km/h.'],
    ["The ratio of A's salary to B's is 4:5. A gets a 25% raise and B a 20% raise. What is the new ratio?", ['1:1', '5:6', '4:5', '6:5'], 1, '4 x 1.25 = 5 and 5 x 1.2 = 6, so 5:6.'],
    ['A price rises by 10% and then falls by 10%. What is the net change?', ['No change', '1% increase', '1% decrease', '2% decrease'], 2, '1.1 x 0.9 = 0.99, a 1% decrease.'],
    ['In how many years will Rs 6,000 earn Rs 1,800 as simple interest at 10% per annum?', ['2 years', '3 years', '4 years', '5 years'], 1, '6000 x 10 x t / 100 = 1800 gives t = 3.'],
    ['40 litres of a mixture has milk and water in the ratio 3:1. How much water must be added to make the ratio 3:2?', ['5 litres', '8 litres', '10 litres', '15 litres'], 2, 'Milk 30, water 10. For 3:2 water must be 20, so add 10 litres.'],
    ['A can do a job in 12 days. A and B together finish it in 8 days. How long would B take alone?', ['16 days', '20 days', '24 days', '30 days'], 2, '1/8 - 1/12 = 1/24, so 24 days.'],
    ['By selling 12 pens for Rs 90, a shopkeeper loses 25%. What did the 12 pens cost him?', ['Rs 100', 'Rs 112.50', 'Rs 120', 'Rs 125'], 2, 'Selling price is 75% of cost: 90 / 0.75 = 120.'],
    ['Two numbers are in the ratio 3:5 and their HCF is 6. What is their LCM?', ['60', '90', '120', '180'], 1, 'The numbers are 18 and 30; their LCM is 90.'],
  ],
  [LR]: [
    ['Find the next number: 1, 1, 2, 3, 5, 8, ?', ['11', '12', '13', '15'], 2, 'Each term is the sum of the two before it: 5 + 8 = 13.'],
    ['Find the next number: 4, 9, 19, 39, ?', ['59', '69', '78', '79'], 3, 'Each term is double the previous plus 1: 39 x 2 + 1 = 79.'],
    ["In a code, 'MANGO' is written as 'NBOHP'. How is 'APPLE' written?", ['BQQMF', 'BOQMF', 'BQQME', 'AQQMF'], 0, 'Each letter moves forward by one.'],
    ['Statements: All pens are books. All books are bags. Conclusions: I. All pens are bags. II. Some bags are pens.', ['Only I follows', 'Only II follows', 'Both I and II follow', 'Neither follows'], 2, 'Pens are inside books, which are inside bags, so all pens are bags and some bags are pens.'],
    ['Find the odd one out: 121, 144, 169, 190', ['121', '144', '169', '190'], 3, '121, 144 and 169 are perfect squares; 190 is not.'],
    ['Find the next letter: B, E, H, K, ?', ['L', 'M', 'N', 'O'], 2, 'Each letter moves forward by three: K + 3 = N.'],
    ["If A = 1, B = 2 ... Z = 26, then SKY = 55. What is SEA?", ['24', '25', '26', '27'], 1, 'S + E + A = 19 + 5 + 1 = 25.'],
    ['Find the next pair: AB, DE, GH, ?', ['IJ', 'JK', 'KL', 'HI'], 1, 'Each pair skips one letter: AB (C) DE (F) GH (I) JK.'],
    ['Statements: Some students are athletes. All athletes are disciplined. Conclusions: I. Some students are disciplined. II. All disciplined people are athletes.', ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows'], 0, 'Students who are athletes are disciplined, so I follows. II reverses the statement and does not follow.'],
    ['Find the next number: 2, 6, 12, 20, 30, ?', ['38', '40', '42', '44'], 2, 'The terms are 1x2, 2x3, 3x4, 4x5, 5x6, so next is 6x7 = 42.'],
  ],
  [VA]: [
    ['Choose the correctly spelt word.', ['Accomodate', 'Accommodate', 'Acommodate', 'Accommadate'], 1, "'Accommodate' has a double c and a double m."],
    ["What does the idiom 'to burn the midnight oil' mean?", ['To work or study late into the night', 'To waste resources', 'To start a quarrel', 'To celebrate late'], 0, 'It means staying up late to work or study.'],
    ["Choose the word closest in meaning to 'Meticulous'.", ['Careless', 'Very careful and precise', 'Quick', 'Generous'], 1, 'Meticulous means showing great attention to detail.'],
    ["Choose the word most nearly opposite in meaning to 'Transparent'.", ['Clear', 'Opaque', 'Honest', 'Visible'], 1, 'Transparent lets light through; opaque does not.'],
    ["Choose the word that best completes the sentence: 'Despite repeated reminders, the team ___ to meet the deadline.'", ['failed', 'succeeded', 'agreed', 'hurried'], 0, "'Despite' signals a contrast with the reminders, so 'failed' fits."],
    ["Choose the one word for: 'A person who can speak many languages'.", ['Linguist', 'Polyglot', 'Translator', 'Orator'], 1, 'A polyglot knows and uses several languages.'],
    ['Choose the pair with the same relationship as Doctor : Diagnosis.', ['Judge : Verdict', 'Lawyer : Court', 'Teacher : Student', 'Writer : Pen'], 0, 'A doctor gives a diagnosis; a judge gives a verdict.'],
    ['Passage: Many startups fail not because their idea is poor, but because they run out of cash before they find customers willing to pay. What is the main point?', ['Most startup ideas are poor', 'Managing money until there are paying customers is critical', 'Startups should avoid customers', 'Investors cause startups to fail'], 1, 'The passage says running out of cash before finding paying customers is the real cause.'],
  ],
  [AR]: [
    ['A man walks 10 km South, turns left and walks 6 km, then turns left again and walks 10 km. Where is he from the start?', ['6 km East', '6 km West', '10 km North', '16 km East'], 0, 'South, then left (East) 6 km, then left (North) 10 km: he ends 6 km East of the start.'],
    ['In a class of 40 students, Asha ranks 12th from the top. What is her rank from the bottom?', ['27th', '28th', '29th', '30th'], 2, '40 - 12 + 1 = 29.'],
    ["Pointing to a photo, Arjun says, 'Her mother is the only daughter of my mother.' How is Arjun related to the girl?", ['Father', 'Brother', 'Uncle', 'Cousin'], 2, "The only daughter of Arjun's mother is his sister, so the girl is his niece and he is her uncle."],
    ['15 August 2023 was a Tuesday. What day was 15 August 2024?', ['Wednesday', 'Thursday', 'Friday', 'Tuesday'], 1, 'The year in between includes 29 February 2024, so 366 days = 52 weeks + 2 days: Thursday.'],
    ['A, B, C, D and E differ in height. B is taller than only E. A is taller than C but shorter than D. Who is the tallest?', ['A', 'C', 'D', 'Cannot be determined'], 2, 'Order from shortest: E, B, C, A, D.'],
    ['How many squares of all sizes are there in a 3 x 3 grid?', ['9', '12', '13', '14'], 3, '9 small + 4 of size 2x2 + 1 of size 3x3 = 14.'],
    ["If 'A $ B' means A is the brother of B and 'A # B' means A is the mother of B, what does 'X # Y $ Z' mean?", ['X is the mother of Z', 'X is the aunt of Z', 'X is the sister of Z', 'X is the grandmother of Z'], 0, 'X is the mother of Y, and Y is the brother of Z, so X is also the mother of Z.'],
    ['A clock gains 5 minutes every hour. It is set right at 8:00 AM. What time will it show at 2:00 PM the same day?', ['2:25 PM', '2:30 PM', '2:35 PM', '2:05 PM'], 1, '6 hours x 5 minutes = 30 minutes fast.'],
    ['Seven boxes are stacked one above another. Box P is third from the top and box Q is two places below P. What is Q\'s position from the bottom?', ['2nd', '3rd', '4th', '5th'], 1, 'Q is 5th from the top, so 7 - 5 + 1 = 3rd from the bottom.'],
    ["In a code, North is called East, East is called South, South is called West and West is called North. In this code, what is the direction opposite to 'South' called?", ['North', 'East', 'West', 'South'], 0, "'South' stands for East. The opposite of East is West, which is called 'North'."],
  ],
  [GA]: [
    ['What is the HCF of 36, 48 and 60?', ['6', '12', '18', '24'], 1, '12 is the largest number dividing all three.'],
    ['What is the unit digit of 3 raised to the power 45?', ['1', '3', '7', '9'], 1, 'Unit digits of powers of 3 cycle 3, 9, 7, 1; 45 mod 4 = 1, giving 3.'],
    ['What is the angle between the hands of a clock at 2:30?', ['95 degrees', '100 degrees', '105 degrees', '115 degrees'], 2, 'Hour hand 2 x 30 + 30 x 0.5 = 75; minute hand 180; difference 105.'],
    ['How many numbers from 1 to 100 are divisible by both 4 and 6?', ['6', '7', '8', '9'], 2, 'They must be multiples of 12: 12, 24, ... 96, which is 8 numbers.'],
    ['What is the sum of the first 20 natural numbers?', ['190', '200', '210', '220'], 2, '20 x 21 / 2 = 210.'],
    ['Which is larger: 2 to the power 10, or 10 to the power 3?', ['2 to the power 10', '10 to the power 3', 'Both are equal', 'Cannot be compared'], 0, '2^10 = 1,024 and 10^3 = 1,000.'],
    ['If the day before yesterday was Thursday, what day will it be the day after tomorrow?', ['Sunday', 'Monday', 'Tuesday', 'Friday'], 1, 'Today is Saturday, so the day after tomorrow is Monday.'],
    ['A number leaves remainder 3 when divided by 7. What is the remainder when twice the number is divided by 7?', ['3', '5', '6', '1'], 2, '2 x 3 = 6, which is less than 7.'],
    ['What is 0.125 as a fraction?', ['1/4', '1/6', '1/8', '1/12'], 2, '0.125 = 125/1000 = 1/8.'],
  ],
};

export const moreHard = {
  [QA]: [
    ['A trader marks his goods 40% above cost and then gives a 25% discount. What is his profit or loss?', ['5% profit', '5% loss', '15% profit', '10% profit'], 0, '1.40 x 0.75 = 1.05, a 5% profit.'],
    ['Walking at 4 km/h, A reaches the office 10 minutes late; at 5 km/h he is 5 minutes early. How far is the office?', ['4 km', '5 km', '6 km', '7.5 km'], 1, 'd/4 - d/5 = 15 minutes = 1/4 hour, so d/20 = 1/4 and d = 5 km.'],
    ['A town\'s population grows 10% every year. It is 12,100 now. What was it 2 years ago?', ['9,800', '10,000', '10,100', '10,890'], 1, '12,100 / (1.1 x 1.1) = 10,000.'],
    ['Pipe A fills a tank in 6 hours and pipe B empties it in 9 hours. If both are opened on an empty tank, when will it be full?', ['12 hours', '15 hours', '18 hours', '24 hours'], 2, '1/6 - 1/9 = 1/18 of the tank per hour, so 18 hours.'],
    ['At compound interest a sum becomes Rs 8,820 in 2 years and Rs 9,261 in 3 years. What is the rate of interest?', ['4%', '5%', '6%', '7.5%'], 1, 'One year\'s growth: 9261 / 8820 = 1.05, so 5%.'],
  ],
  [LR]: [
    ['Find the next number: 1, 2, 6, 24, 120, ?', ['240', '600', '720', '840'], 2, 'Multiply by 2, 3, 4, 5, then 6: 120 x 6 = 720.'],
    ['Find the next number: 7, 10, 8, 11, 9, 12, ?', ['10', '11', '13', '14'], 0, 'The pattern alternates +3, -2: 12 - 2 = 10.'],
    ['Statements: No teacher is a thief. Some thieves are rich. Conclusions: I. Some rich people are not teachers. II. No rich person is a teacher.', ['Only I follows', 'Only II follows', 'Both follow', 'Neither follows'], 0, 'The rich thieves cannot be teachers, so I follows. Other rich people may be teachers, so II does not.'],
    ["In a code, 'COLD' is written as 'DQOH'. How is 'WARM' written?", ['XCUQ', 'XBUQ', 'XCTQ', 'YCUQ'], 0, 'Letters move forward by 1, 2, 3 and 4: W>X, A>C, R>U, M>Q.'],
    ['Find the next number: 6, 11, 21, 36, 56, ?', ['76', '80', '81', '86'], 2, 'Differences are 5, 10, 15, 20, 25: 56 + 25 = 81.'],
  ],
  [AR]: [
    ['A cube painted on all faces is cut into 64 identical smaller cubes. How many small cubes have no painted face?', ['4', '8', '16', '24'], 1, 'The unpainted inner block is 2 x 2 x 2 = 8 cubes.'],
    ['A man faces North-East. He turns 135 degrees clockwise and then 90 degrees anticlockwise. Which direction does he face now?', ['East', 'South-East', 'North', 'South'], 0, 'North-East + 135 clockwise = South; 90 anticlockwise from South = East.'],
    ["A is B's sister. C is B's mother. D is C's father. E is D's mother. How is A related to D?", ['Granddaughter', 'Daughter', 'Grandmother', 'Great-granddaughter'], 0, "A is C's daughter, and D is C's father, so A is D's granddaughter."],
    ['In a row, Ram is 12th from the left and Shyam is 15th from the right. When they swap places, Ram becomes 20th from the left. How many children are in the row?', ['32', '33', '34', '35'], 2, "Shyam's old place is 20th from the left and 15th from the right: 20 + 15 - 1 = 34."],
    ['How many times in a day are the hands of a clock at right angles?', ['22', '24', '44', '48'], 2, 'They are at right angles 22 times every 12 hours, so 44 times a day.'],
    ['1 January of a non-leap year is a Monday. What day is 31 December of that year?', ['Sunday', 'Monday', 'Tuesday', 'Saturday'], 1, '31 December is 364 days later, exactly 52 weeks, so it is also a Monday.'],
  ],
  [GA]: [
    ['At what time between 3 and 4 o\'clock are the hands of a clock together?', ['3:15', '3:16 4/11', '3:17 3/11', '3:18'], 1, 'The minute hand gains 5.5 degrees a minute and must close a 90 degree gap: 90 / 5.5 = 16 4/11 minutes.'],
    ['What is the remainder when 2 raised to the power 100 is divided by 3?', ['0', '1', '2', 'Cannot be determined'], 1, '2 leaves remainder -1 with 3, and (-1)^100 = 1.'],
    ['How many zeros are there at the end of 100! (100 factorial)?', ['20', '22', '24', '25'], 2, '100/5 + 100/25 = 20 + 4 = 24.'],
    ['What is the smallest number that leaves remainder 1 when divided by 2, 3, 4, 5 and 6?', ['31', '59', '61', '121'], 2, 'LCM of 2 to 6 is 60, plus 1 = 61.'],
    ['A bat and a ball cost Rs 110 together. The bat costs Rs 100 more than the ball. How much does the ball cost?', ['Rs 5', 'Rs 10', 'Rs 15', 'Rs 1'], 0, 'Ball x, bat x + 100: 2x + 100 = 110, so x = 5 (not 10).'],
    ['If 5 machines make 5 parts in 5 minutes, how long will 100 machines take to make 100 parts?', ['1 minute', '5 minutes', '20 minutes', '100 minutes'], 1, 'Each machine makes one part in 5 minutes, so 100 machines make 100 parts in 5 minutes.'],
  ],
};
