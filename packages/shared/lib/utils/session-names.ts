/**
 * Generate random but intelligible session names
 * 
 * Note: This function is duplicated in @extension/storage/session-storage.ts
 * to avoid circular dependency (shared depends on storage for types).
 * Keep both implementations in sync when making changes.
 */
export const generateSessionName = (): string => {
  const adjectives = [
    // Speed & Efficiency
    'Quick', 'Swift', 'Rapid', 'Agile', 'Efficient', 'Streamlined', 'Nimble', 'Express',
    // Intelligence & Insight
    'Smart', 'Bright', 'Clever', 'Wise', 'Sharp', 'Keen', 'Astute', 'Brilliant',
    // Quality & Excellence
    'Prime', 'Elite', 'Premium', 'Superior', 'Excellent', 'Optimal', 'Perfect', 'Refined',
    // Innovation & Creativity
    'Creative', 'Innovative', 'Inventive', 'Original', 'Novel', 'Fresh', 'Modern', 'Advanced',
    // Strength & Impact
    'Bold', 'Strong', 'Robust', 'Powerful', 'Dynamic', 'Vital', 'Solid', 'Sturdy',
    // Clarity & Precision
    'Clear', 'Precise', 'Focused', 'Distinct', 'Exact', 'Accurate', 'Crisp', 'Defined',
    // Style & Presentation
    'Elegant', 'Sleek', 'Polished', 'Sophisticated', 'Professional', 'Refined', 'Stylish', 'Classic',
    // Vision & Ambition
    'Stellar', 'Epic', 'Grand', 'Noble', 'Visionary', 'Ambitious', 'Strategic', 'Forward',
    // Energy & Motion
    'Active', 'Lively', 'Vivid', 'Energetic', 'Vibrant', 'Animated', 'Spirited', 'Brisk',
    // Calm & Balance
    'Calm', 'Steady', 'Balanced', 'Stable', 'Composed', 'Harmonious', 'Serene', 'Poised'
  ];
  
  const nouns = [
    // Work & Projects
    'Project', 'Task', 'Assignment', 'Initiative', 'Undertaking', 'Endeavor', 'Enterprise', 'Venture',
    // Planning & Strategy
    'Plan', 'Strategy', 'Blueprint', 'Roadmap', 'Framework', 'Scheme', 'Approach', 'Method',
    // Goals & Objectives
    'Goal', 'Objective', 'Target', 'Milestone', 'Achievement', 'Outcome', 'Result', 'Deliverable',
    // Process & Workflow
    'Flow', 'Process', 'Workflow', 'Pipeline', 'Sequence', 'Cycle', 'Routine', 'Procedure',
    // Ideas & Concepts
    'Idea', 'Concept', 'Notion', 'Vision', 'Insight', 'Thought', 'Perspective', 'Angle',
    // Creation & Development
    'Draft', 'Sketch', 'Prototype', 'Design', 'Build', 'Creation', 'Development', 'Implementation',
    // Research & Analysis
    'Research', 'Study', 'Analysis', 'Investigation', 'Exploration', 'Examination', 'Assessment', 'Review',
    // Sessions & Meetings
    'Session', 'Meeting', 'Discussion', 'Consultation', 'Conference', 'Workshop', 'Briefing', 'Sync',
    // Journey & Progress
    'Journey', 'Path', 'Quest', 'Mission', 'Expedition', 'Campaign', 'Sprint', 'Marathon',
    // Focus & Attention
    'Focus', 'Scope', 'Domain', 'Area', 'Field', 'Zone', 'Sector', 'Space',
    // Communication & Content
    'Query', 'Topic', 'Subject', 'Thread', 'Dialog', 'Exchange', 'Discourse', 'Report',
    // Organization & Structure
    'Module', 'Component', 'Section', 'Segment', 'Phase', 'Stage', 'Chapter', 'Unit'
  ];
  
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${randomAdjective} ${randomNoun}`;
};

