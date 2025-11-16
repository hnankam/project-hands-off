# Mermaid Diagram Test Examples

This file contains various Mermaid diagrams to test the implementation.

## Test 1: Simple Flowchart

````markdown
```mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> A
    C --> E[End]
```
````

## Test 2: Sequence Diagram

````markdown
```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant Extension
    participant AI
    User->>Browser: Open side panel
    Browser->>Extension: Load extension
    Extension->>AI: Initialize chat
    AI-->>Extension: Ready
    Extension-->>User: Show chat interface
    User->>AI: Send message
    AI-->>User: Display response with diagram
```
````

## Test 3: Simple Pie Chart

````markdown
```mermaid
pie title Browser Market Share 2024
    "Chrome" : 65
    "Safari" : 18
    "Firefox" : 9
    "Edge" : 5
    "Others" : 3
```
````

## Test 4: State Diagram

````markdown
```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: User input
    Processing --> Success: Valid
    Processing --> Error: Invalid
    Success --> Idle: Continue
    Error --> Idle: Retry
    Success --> [*]: Complete
```
````

## Test 5: Custom Tag Method (CopilotKit only)

```xml
<mermaid>
graph LR
    A[Custom Tag] --> B[MermaidBlock]
    B --> C[Rendered Diagram]
</mermaid>
```

## Test 6: Git Graph

````markdown
```mermaid
gitGraph
    commit
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
    commit
```
````

## Test 7: Complex Class Diagram

````markdown
```mermaid
classDiagram
    class User {
        +String id
        +String name
        +String email
        +login()
        +logout()
    }
    class Session {
        +String sessionId
        +Date createdAt
        +Array messages
        +save()
        +restore()
    }
    class Message {
        +String id
        +String content
        +String role
        +Date timestamp
    }
    User "1" --> "*" Session
    Session "1" --> "*" Message
```
````

## Test 8: Entity Relationship Diagram

````markdown
```mermaid
erDiagram
    USER ||--o{ SESSION : creates
    SESSION ||--|{ MESSAGE : contains
    MESSAGE ||--o{ ATTACHMENT : has
    USER {
        string id PK
        string name
        string email
    }
    SESSION {
        string sessionId PK
        string userId FK
        datetime createdAt
    }
    MESSAGE {
        string messageId PK
        string sessionId FK
        string content
        string role
    }
```
````

## Test 9: Gantt Chart

````markdown
```mermaid
gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Phase 1
    Research           :done, research, 2024-01-01, 2024-01-15
    Design            :done, design, 2024-01-16, 2024-01-31
    section Phase 2
    Implementation    :active, impl, 2024-02-01, 2024-03-15
    Testing           :test, 2024-03-16, 2024-03-31
    section Phase 3
    Deployment        :deploy, 2024-04-01, 2024-04-15
```
````

## Test 10: Journey Diagram

````markdown
```mermaid
journey
    title User's Chat Experience
    section Login
      Open Extension: 5: User
      Authenticate: 3: User, System
    section Chat
      Start Conversation: 5: User
      AI Responds: 5: User, AI
      View Diagram: 5: User
    section Customize
      Change Theme: 4: User
      Adjust Settings: 4: User
```
````

## Test 11: Error Case (Invalid Syntax)

This should show an error with helpful message:

````markdown
```mermaid
graph TD
    A[Start
    B[Missing bracket]
```
````

## Instructions for Testing

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Run development server**:
   ```bash
   pnpm dev
   ```

3. **Test in chat**:
   - Open the browser extension
   - Go to the side panel
   - Start a chat session
   - Paste any of the examples above
   - AI should render the diagram

4. **Test with AI generation**:
   Ask the AI:
   - "Create a flowchart showing user authentication"
   - "Draw a sequence diagram for API calls"
   - "Generate a class diagram for a todo app"

5. **Test theme switching**:
   - Toggle between light and dark mode
   - Diagrams should adapt automatically

6. **Test error handling**:
   - Try Test 11 (invalid syntax)
   - Should show error message with collapsible code

## Expected Behavior

### ✅ Success Indicators
- Diagrams render correctly
- Theme switches automatically (light/dark)
- Loading states show briefly
- No console errors

### ❌ Failure Indicators
- "Loading diagram..." never completes
- Red error boxes appear
- Console shows mermaid errors
- Blank spaces where diagrams should be

## Troubleshooting

If diagrams don't render:

1. Check browser console for errors
2. Verify mermaid dependency is installed
3. Check if code block has correct language tag
4. Try simpler diagrams first
5. Test with both methods (code block and custom tag)

