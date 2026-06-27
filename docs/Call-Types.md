# Configuring Incident Types

## Overview

Incident types are automatically discovered from your pager messages. Each type gets a category, color, and pin letter that controls how it appears on the live map.

## Auto-Discovery

1. Go to **Admin → Call Types**
2. Click **Scan for New Types**
3. The system scans all messages and finds unique call types
4. Each new type gets an auto-assigned category, color, and pin letter

## Editing Types

Click any type to edit:
- **Display Name**: Human-readable name
- **Category**: Grouping for the map filter bar (Fire, Alarms, Medical, etc.)
- **Color**: Hex color picker for the map pin
- **Pin Letter**: 1-3 characters shown inside the map marker

## Batch Editing

Select multiple types with checkboxes, then use the batch bar to set a common category or color for all of them at once.

## How Auto-Assignment Works

The system uses these rules to categorize new types:

| Pattern | Category | Color |
|---------|----------|-------|
| `ALARM-*` | Alarms | Purple |
| `*FIRE` | Fire | Red |
| `MVC*` | Traffic | Yellow |
| `MEDICAL` | Medical | Blue |
| `RESCUE` | Rescue | Teal |
| `HAZMAT*` | HazMat | Orange |
| `*GAS*` | Utilities | Brown |
| Everything else | Other | Gray |

Pin letters are extracted from the type name (e.g. `ALARM-COMMERCIAL` → `CO`, `STRUCTFIRE` → `SF`).

## Deactivating Types

Toggle the **Active** checkbox off to hide a type from the map filter bar. Calls of that type will still appear as "Other."
