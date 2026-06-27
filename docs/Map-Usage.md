# Using the Public Live Map

## Access

The map is at `http://your-server:5000` (or whatever port you configured).

## Features

### Viewing Calls

- Each colored pin represents one geocoded call
- Click a pin to see a popup with incident type and address
- The sidebar opens with full call details: address, source, station, cross streets, raw message
- Share any call: click it and the URL updates to `?call=123` — anyone with that link sees the same call

### Time Range

Use the dropdown to choose how far back to view:
- Past 3/6/12/24/48/72 hours
- Since Midnight (server timezone)
- Custom Date — pick specific from/to dates

### Category Filters

Checkboxes below the top bar filter by incident type. Configure categories and colors in **PagerMon Admin → Call Types**.

### Live Feed Mode

Click **Live Feed** to show only the single most recent call. The map automatically pans to each new dispatch. Useful for operations centers.

### Heatmap

Toggle heatmap view to see call density across your area.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `?` | Help menu |
| `F` | Fit all calls in view |
| `M` | Mute/unmute notification sound |
| `L` | Toggle Live Feed mode |
| `N` | Open notifications panel |
| `T` | Inject test call |
| `Esc` | Close sidebar and panels |

### Dark/Light Theme

Click the moon icon to toggle between dark and light mode. Preference is saved in your browser.

### Notifications

Click the bell icon to see recent calls. Enable desktop notifications in your browser for popup alerts even when the tab is in the background.

### Address Search

Click the magnifying glass to search for any address or location. The map pans to that spot.

### My Location

Click the crosshair icon to center the map on your GPS position (requires browser permission).
