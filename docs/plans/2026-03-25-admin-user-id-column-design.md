# Admin User ID Column Design
**Date:** 2026-03-25

## Overview
Add a User ID column to the admin page user table as the last column, displaying the unique identifier for each user as plain text.

## Requirements
- Display user ID in the admin user table
- Position: Last column (after Photos)
- Format: Plain text, no special styling
- No API changes needed (ID already available in response)

## Design Details

### UI Changes
- Add `User ID` header column at the end of the table
- Display `user.id` for each user row
- Use consistent table styling with existing columns
- Simple, unadorned display

### File Changes
**frontend/src/components/AdminView.tsx:**
- Add header cell: `<th>User ID</th>`
- Add body cell: `<td>{user.id}</td>`

### No Changes Required
- API (ID already in response)
- Database schema
- Backend logic
- Styling framework

## Acceptance Criteria
- ✓ User ID column visible as last column in admin table
- ✓ All users display their ID correctly
- ✓ Table styling remains consistent
- ✓ No breaking changes to existing functionality
