// Generate random but intelligible session names
export const generateSessionName = (): string => {
  const adjectives = [
    'Quick', 'Bright', 'Smart', 'Swift', 'Creative', 'Clever', 'Agile', 'Bold',
    'Wise', 'Sharp', 'Active', 'Dynamic', 'Keen', 'Lively', 'Vivid', 'Calm',
    'Fresh', 'Elegant', 'Nimble', 'Stellar', 'Epic', 'Prime', 'Noble', 'Pure'
  ];
  
  const nouns = [
    'Task', 'Project', 'Query', 'Session', 'Work', 'Flow', 'Quest', 'Mission',
    'Plan', 'Goal', 'Idea', 'Topic', 'Thread', 'Path', 'Journey', 'Sprint',
    'Focus', 'Draft', 'Sketch', 'Study', 'Research', 'Review', 'Build', 'Design'
  ];
  
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${randomAdjective} ${randomNoun}`;
};

