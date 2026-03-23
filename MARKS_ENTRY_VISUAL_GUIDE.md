# Marks Entry Interface - Visual Structure

## Current UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 ENTER LEARNERS MARKS (Subject-Based Bulk Entry)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Step 1: Select Your Subject & Class                             │
│ ┌───────────────┬─────────────┬──────────────┬────────┬────────┐│
│ │ Subject &     │ Term        │ Assessment   │ Year   │ 📥     ││
│ │ Class ▼       │ ▼           │ ▼            │ 2024   │ Load   ││
│ │               │             │              │ (R/O)  │        ││
│ └───────────────┴─────────────┴──────────────┴────────┴────────┘│
│                                                                   │
│─────────────────────────────────────────────────────────────────│
│                                                                   │
│ Step 2: Enter Marks for Each Student                            │
│ ┌────────┬─────────────────┬────────┬──────────┬───────────────┐ │
│ │ ADM No │ Student Name    │ Term ▼ │ Assess ▼ │ Marks/Scores  │ │
│ ├────────┼─────────────────┼────────┼──────────┼───────────────┤ │
│ │ ADM001 │ John Mwangi     │  [  ]  │  [  ]    │ [___]         │ │
│ │ ADM002 │ Sarah Kipchoge  │  [  ]  │  [  ]    │ [___]         │ │
│ │ ADM003 │ Ahmed Hassan    │  [  ]  │  [  ]    │ [___]         │ │
│ │ ...    │ ...             │  ...   │  ...     │ ...           │ │
│ └────────┴─────────────────┴────────┴──────────┴───────────────┘ │
│                                               ✅ Submit All    │ │
│                                                  Marks          │ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## For Senior School (Grade 10-12)

The Marks column expands to show:

```
┌─────────────────────────────────────────────────────┐
│          CA (30%)  PW (20%)  Exam (50%)  Final      │
│         ┌────────┬────────┬────────┬────────┐       │
│ Grade   │        │        │        │        │       │
│ 10A     │ [__]   │ [__]   │ [__]   │ [--]   │ R/O   │
│ 11B     │ [__]   │ [__]   │ [__]   │ [--]   │ Auto  │
│ 12C     │ [__]   │ [__]   │ [__]   │ [--]   │ Calc  │
│         └────────┴────────┴────────┴────────┘       │
│                                                      │
│ Legend:                                              │
│ CA = Continuous Assessment                          │
│ PW = Project Work                                   │
│ Exam = End-Term Examination                         │
│ Final = Auto-calculated weighted average            │
└─────────────────────────────────────────────────────┘
```

## Subject Allocation Dropdown

Teachers see all their subject/class allocations:
- Grade 1A: Kiswahili, English, Mathematics
- Grade 5B: Mathematics, English, Environmental Activities
- Grade 7A: Mathematics, English, Kiswahili, Integrated Science
- Grade 10A STEM: Mathematics, Physics, Chemistry, Biology
- Grade 11B Social: History & Citizenship, Geography, Economics

## Assessment Options

- Midterm
- Assessment 1
- Assessment 2
- Assessment 3
- Assessment 4
- End Term

## Data Flow

```
1. Teacher selects Subject & Class
   ↓
2. Teacher selects Term, Assessment, Year
   ↓
3. Teacher clicks "Load Students"
   ↓
4. System fetches students from /enrollment/class/{classLabel}
   ↓
5. Students populated in table with dropdowns and input fields
   ↓
6. Teacher enters marks for each student
   ↓
7. For Senior School: Final score auto-calculated as you enter marks
   ↓
8. Teacher clicks "Submit All Marks"
   ↓
9. Each mark is submitted via POST /marks/add
   ↓
10. Success message shown, table cleared
    ↓
11. Submitted marks appear in section below for reference
```

## Key Features

✅ **Bulk Entry** - Enter marks for entire class at once
✅ **Auto-Population** - Students auto-load when subject selected
✅ **Validation** - Real-time validation with clear error messages
✅ **Auto-Calculation** - Senior school final scores calculated automatically
✅ **Responsive Design** - Works on desktop, tablet, mobile
✅ **Clear Visual Hierarchy** - Step-by-step interface
✅ **Color-Coded** - Blue header, light backgrounds for focus
✅ **Accessibility** - Proper labels, keyboard navigation
✅ **Feedback** - Toast notifications for all actions
✅ **Error Handling** - Shows which rows have issues

## Implementation Details

### HTML Structure
- Subject dropdown: Single select with all allocations
- Controls section: Flex layout with dropdowns and buttons
- Table section: Hidden by default, shows after selection
- Responsive grid for marks columns

### JavaScript Logic
- Event listener on subject dropdown triggers table display
- Load button fetches students from API
- Table dynamically adjusts columns based on grade level
- Auto-calculation for senior school marks
- Batch submission with error handling

### CSS Styling
- Linear gradient header (blue theme)
- Responsive grid layout
- Hover effects on rows
- Color-coded backgrounds (white, light gray for alternating rows)
- Proper spacing and padding for mobile
- Shadow effects for depth

---

Generated: 2024
System Version: CBC Portal Marks Entry v2.0
