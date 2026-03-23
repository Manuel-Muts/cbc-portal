# Teachers Marks Entry - Restructured System

## Overview
The teachers marks entry system has been completely restructured to provide a more efficient, bulk-entry interface. Instead of entering marks one student at a time, teachers can now select a subject/class and bulk-enter marks for all students in that class in one go.

## New Workflow

### Step 1: Select Subject & Class
- Teachers see a dropdown showing all their subject allocations with class labels
- Format: `[Class Label]: [Subject 1], [Subject 2], ...`
- Example: `Grade 7A: Mathematics, English, Kiswahili`

### Step 2: Set Term, Assessment & Year
- **Term**: Select which term (1, 2, or 3)
- **Assessment**: Select the type of assessment
  - Midterm
  - Assessment 1-4
  - End Term
- **Year**: Auto-populated with current year (read-only)

### Step 3: Load Students
- Click the **"📥 Load Students"** button
- The system automatically fetches all students in that class
- Displays them in a table with:
  - **ADM No** (Admission Number)
  - **Student Name**
  - **Term** (dropdown - required)
  - **Assessment** (dropdown - required)
  - **Marks Columns** (varies by grade level)

### Step 4: Enter Marks
#### For Junior (Grades 1-9):
- Single **Marks** column (0-100)

#### For Senior (Grades 10-12):
- **CA (Continuous Assessment)** - 0-100 (30% weight)
- **PW (Project Work)** - 0-100 (20% weight)
- **Exam (End-Term Exam)** - 0-100 (50% weight)
- **Final** (auto-calculated) - Read-only field showing weighted average

The final score is automatically calculated as:
```
Final = (CA × 0.30) + (PW × 0.20) + (Exam × 0.50)
```

### Step 5: Submit All Marks
- Click **"✅ Submit All Marks"** button
- System validates all entries:
  - Term and Assessment are selected for each student
  - Marks are within 0-100 range
  - For senior school, at least one marks component is entered
- Confirms success/failure count
- Clears the table after successful submission
- Updates the "Submitted Marks" section below

## Features

### Automatic Calculations
- Senior school final scores are calculated automatically as you enter marks
- The row highlights in light yellow when you modify any marks field

### Validation
- All required fields must be filled before submission
- Marks must be between 0-100
- Term and Assessment dropdowns are mandatory for each row
- Real-time validation with clear error messages

### User Experience
- Responsive table design that works on different screen sizes
- Loading spinner during data fetch operations
- Toast notifications for success/error messages
- Color-coded headers: Blue header with white text for clarity
- Hover effects on table rows for better usability

### Data Organization
- All marks for a subject/class/term/assessment are submitted together
- Submitted marks are displayed below in accordion format
- Can download submitted marks as PDF
- Easy search and filter functionality for reviewed marks

## Technical Details

### API Endpoints Used
- `/users/subjects/my-allocations` - Get teacher's subject allocations
- `/enrollment/class/{classLabel}` - Get students in a class
- `/marks/add` - Submit marks (called once per student)

### HTML Elements
- Subject allocation dropdown: `#subjectAllocationSelect`
- Marks table container: `#marksTableContainer`
- Load button: `#loadStudentsBtn`
- Submit button: `#submitAllMarksBtn`
- Year input: `#marksYearInput` (auto-filled with current year)
- Term select: `#marksTermSelect`
- Assessment select: `#marksAssessmentSelect`
- Table body: `#marksEntryTableBody`

### JavaScript Functions
- `loadStudentsForSubject(classLabel)` - Fetches students for a class
- `displayStudentsInMarksTable(students)` - Renders students in table
- `resetMarksTable()` - Clears the table
- `validateMarksTable()` - Validates all entries
- `populateSubjectAllocations(allocations)` - Populates the dropdown

## Migration Notes

The old form-based individual entry system has been replaced with the new table-based bulk entry system. The advantages are:

1. **Faster data entry** - Enter marks for multiple students at once
2. **Easier review** - See all students in one place
3. **Better validation** - Catches errors before submission
4. **Improved UX** - Clear layout with color-coded sections
5. **Automatic calculations** - No manual calculation needed for senior school

## Browser Compatibility
- Works on all modern browsers (Chrome, Firefox, Safari, Edge)
- Responsive design for mobile and tablet devices
- Supports both junior and senior school marking schemes

---

## Example Workflow

1. Teacher logs in
2. Selects "Grade 7A: Mathematics, English, Kiswahili" from dropdown
3. Selects "Term 1", "Assessment 1", Year auto-fills to 2024
4. Clicks "Load Students" → 35 students appear in table
5. Enters marks in the marks column for each student
6. Clicks "Submit All Marks"
7. System shows: "✅ Submitted: 35 mark(s) saved, 0 failed"
8. The submitted marks appear in the section below for reference
