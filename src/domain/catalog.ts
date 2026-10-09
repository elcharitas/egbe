export type Direction = 'web' | 'numbers';

export interface LearningResource {
  id: string;
  direction: Direction;
  title: string;
  publisher: string;
  url: string;
  summary: string;
  access: string;
}

export const resources: LearningResource[] = [
  {
    id: 'mdn-html',
    direction: 'web',
    title: 'HTML: Creating the content',
    publisher: 'MDN Web Docs · Mozilla community',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Creating_the_content',
    summary: 'Learn how headings, paragraphs, and links give a page structure.',
    access: 'Free article · no login observed',
  },
  {
    id: 'mdn-css',
    direction: 'web',
    title: 'CSS: Styling the content',
    publisher: 'MDN Web Docs · Mozilla community',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Getting_started/Your_first_website/Styling_the_content',
    summary: 'Connect a stylesheet and make your first page easier to read.',
    access: 'Free article · no login observed',
  },
  {
    id: 'math-percent',
    direction: 'numbers',
    title: 'Understanding percentages',
    publisher: 'Math is Fun · Rod Pierce',
    url: 'https://www.mathsisfun.com/percentage.html',
    summary: 'Explore parts of a hundred with examples of everyday discounts.',
    access: 'Free explanation · no login observed',
  },
  {
    id: 'skills-percent',
    direction: 'numbers',
    title: 'Percentages: an introduction',
    publisher: 'SkillsYouNeed',
    url: 'https://www.skillsyouneed.com/num/percentages.html',
    summary: 'A second explanation to compare when a concept does not click.',
    access: 'Free article · paid books advertised separately',
  },
];

export interface LearningStep {
  id: string;
  title: string;
  minutes: number;
  resourceId: string;
  guidance: string;
  prompt: string;
  hint: string;
}

export const directions: Record<
  Direction,
  {
    title: string;
    description: string;
    defaultGoal: string;
    steps: LearningStep[];
  }
> = {
  web: {
    title: 'Build for the web',
    description: 'Turn an idea into a simple, readable web page.',
    defaultGoal: 'Make a simple page about something I care about',
    steps: [
      {
        id: 'web-structure',
        title: 'Give your idea a structure',
        minutes: 10,
        resourceId: 'mdn-html',
        guidance:
          'HTML gives content meaning. Use <h1> for the main heading, ' +
          '<p> for a paragraph, and <a href="..."> for a link. ' +
          'You can sketch your page on paper before opening an editor.',
        prompt:
          'Write a heading and a short paragraph for your page. ' +
          'What would you like a visitor to learn?',
        hint:
          'For example: <h1>Our community garden</h1> followed by ' +
          '<p>We grow vegetables and share what we learn.</p>.',
      },
      {
        id: 'web-style',
        title: 'Make it comfortable to read',
        minutes: 10,
        resourceId: 'mdn-css',
        guidance:
          'CSS changes presentation, not meaning. A rule like ' +
          'p { line-height: 1.6; } adds space between lines. ' +
          'Keep text readable and do not rely on colour alone.',
        prompt:
          'Choose one change that would make your page easier to read. ' +
          'Write the CSS rule, or describe the change in your own words.',
        hint:
          'Try a larger font, more space between lines, or a clear ' +
          'contrast between text and background.',
      },
      {
        id: 'web-review',
        title: 'Look at it through someone else’s eyes',
        minutes: 5,
        resourceId: 'mdn-html',
        guidance:
          'A useful page helps a visitor find their next action. ' +
          'Review your sketch or page on a small screen. ' +
          'If you can, ask a peer what they understand from it.',
        prompt:
          'What works? What would you change next? ' +
          'Write one question you could bring to your circle.',
        hint:
          'Could a visitor find the page title, read the content, and ' +
          'understand where a link will take them?',
      },
    ],
  },
  numbers: {
    title: 'Numbers for everyday life',
    description: 'Understand percentages and compare everyday prices.',
    defaultGoal: 'Feel more confident comparing discounts',
    steps: [
      {
        id: 'numbers-parts',
        title: 'Make sense of “per hundred”',
        minutes: 5,
        resourceId: 'math-percent',
        guidance:
          'A percentage describes parts of a hundred. ' +
          '50% is half, 25% is a quarter, and 10% is a tenth. ' +
          'The same idea works with any currency or quantity.',
        prompt: 'What are 50%, 25%, and 10% of 200? Explain your thinking.',
        hint: 'Half of 200 is 100. A quarter is 50. A tenth is 20.',
      },
      {
        id: 'numbers-discount',
        title: 'Try a real-world discount',
        minutes: 10,
        resourceId: 'math-percent',
        guidance:
          'To find a sale price, first calculate the reduction, ' +
          'then subtract it from the original price. ' +
          'A 25% reduction on 2,000 is 500, leaving 1,500.',
        prompt:
          'An item costs 3,000 in your currency and is reduced by 10%. ' +
          'What is the new price? Try an example from your own day, too.',
        hint: '10% of 3,000 is 300. Subtract 300 to get 2,700.',
      },
      {
        id: 'numbers-compare',
        title: 'Compare, then explain',
        minutes: 5,
        resourceId: 'skills-percent',
        guidance:
          'Compare final prices, not just the size of a discount. ' +
          'A bigger percentage off does not always mean a cheaper item.',
        prompt:
          'Shop A sells an item for 2,000 with 10% off. Shop B sells ' +
          'it for 1,900 with no discount. Which is cheaper, and why?',
        hint:
          'Shop A’s final price is 1,800, so it is 100 cheaper. ' +
          'What other things might matter, such as travel or quality?',
      },
    ],
  },
};
