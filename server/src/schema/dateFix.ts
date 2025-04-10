// Helper functions for date formatting in GraphQL
export function formatDate(date: Date | string | null | undefined): string | null {
  console.log('[DATE DEBUG] formatDate called with:', date);
  console.log('[DATE DEBUG] formatDate input type:', typeof date);
  
  if (date === null) {
    console.log('[DATE DEBUG] formatDate received NULL');
    return null;
  }
  
  if (date === undefined) {
    console.log('[DATE DEBUG] formatDate received UNDEFINED');
    return null;
  }
  
  try {
    // If it's a Date object, convert directly to ISO string
    if (date instanceof Date) {
      console.log('[DATE DEBUG] Processing Date object:', date);
      const isoString = date.toISOString();
      console.log('[DATE DEBUG] Produced ISO string from Date:', isoString);
      return isoString;
    } 
    
    // If it's a string, try to parse it
    if (typeof date === 'string') {
      console.log('[DATE DEBUG] Processing date string:', date);
      
      // Try to detect if it's already an ISO string
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(date)) {
        console.log('[DATE DEBUG] String already looks like ISO format, returning as-is:', date);
        return date;
      }
      
      // Otherwise, try parsing it as a date
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        const isoString = parsedDate.toISOString();
        console.log('[DATE DEBUG] Parsed string as Date, produced ISO string:', isoString);
        return isoString;
      } 
      
      // If we can't parse it as a date, return the original string
      console.log('[DATE DEBUG] Could not parse string as Date, returning as-is:', date);
      return date;
    }
    
    // For any other type, convert to string and try to parse as date
    console.log('[DATE DEBUG] Unexpected type:', typeof date, ', value:', date);
    const stringValue = String(date);
    const parsedDate = new Date(stringValue);
    
    if (!isNaN(parsedDate.getTime())) {
      const isoString = parsedDate.toISOString();
      console.log('[DATE DEBUG] Converted to valid Date, produced ISO string:', isoString);
      return isoString;
    }
    
    // Last resort - return as string
    console.log('[DATE DEBUG] Returning as plain string:', stringValue);
    return stringValue;
  } catch (e) {
    console.error('[DATE DEBUG] Error processing date:', e, 'original value:', date);
    // Return a string representation as fallback
    const fallback = typeof date === 'string' ? date : String(date);
    console.log('[DATE DEBUG] Using fallback string:', fallback);
    return fallback;
  }
}
