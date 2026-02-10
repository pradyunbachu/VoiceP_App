import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, Edit2, Search, Upload } from "lucide-react";
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from "../hooks";
import GoogleCalendarButton from "./GoogleCalendarButton";
import "./Calendar.css";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7 AM to 8 PM

const CALENDAR_CATEGORIES = [
  { id: "personal", name: "Personal", color: "#6b7280" },
  { id: "work", name: "Work", color: "#10b981" },
  { id: "meetings", name: "Meetings", color: "#3b82f6" },
  { id: "health", name: "Health", color: "#f59e0b" },
  { id: "social", name: "Social", color: "#ef4444" },
  { id: "other", name: "Other", color: "#14b8a6" },
];

const EVENT_COLORS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Orange" },
  { value: "#ef4444", label: "Red" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#6b7280", label: "Gray" },
];

const Calendar = ({ showToast }) => {
  const today = new Date();
  const fileInputRef = useRef(null);
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    return start;
  });
  const [currentDay, setCurrentDay] = useState(new Date(today));
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isImporting, setIsImporting] = useState(false);
  const [activeCategories, setActiveCategories] = useState(
    CALENDAR_CATEGORIES.map(c => c.id)
  );
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    start_date: "",
    start_time: "",
    end_date: "",
    end_time: "",
    all_day: false,
    color: "#3b82f6",
  });
  const [draggingEvent, setDraggingEvent] = useState(null);
  const [dragPreview, setDragPreview] = useState(null); // { dayIndex, hour, minutes, height }
  const [calendarView, setCalendarView] = useState("week"); // day, week, month
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const timeGridRef = useRef(null);
  const viewDropdownRef = useRef(null);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close view dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(event.target)) {
        setShowViewDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Determine month/year based on current view for API call
  const getViewDate = () => {
    if (calendarView === "day") return currentDay;
    if (calendarView === "month") return currentMonthDate;
    return currentWeekStart;
  };
  const viewDate = getViewDate();
  const month = viewDate.getMonth() + 1;
  const year = viewDate.getFullYear();

  const { data: events = [], isLoading } = useCalendarEvents(month, year);
  const createMutation = useCreateCalendarEvent();
  const updateMutation = useUpdateCalendarEvent();
  const deleteMutation = useDeleteCalendarEvent();

  // Get the week days
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(date.getDate() + i);
      days.push(date);
    }
    return days;
  }, [currentWeekStart]);

  // Mini calendar days
  const miniCalendarDays = useMemo(() => {
    const firstDay = new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth(), 1);
    const lastDay = new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth() + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days = [];

    // Previous month padding
    const prevMonth = new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth(), 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth() - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth(), i),
        isCurrentMonth: true,
      });
    }

    // Next month padding
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth() + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [miniCalendarDate]);

  // Month view calendar days
  const monthViewDays = useMemo(() => {
    const firstDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 1);
    const lastDay = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const days = [];

    // Previous month padding
    const prevMonth = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth(), i),
        isCurrentMonth: true,
      });
    }

    // Next month padding (ensure we have complete weeks)
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentMonthDate]);

  const formatDateForApi = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const formatTimeDisplay = (hour) => {
    if (hour === 0) return "12 AM";
    if (hour === 12) return "12 PM";
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };

  const formatEventTime = (time) => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours, 10);
    const m = minutes;
    const ampm = h >= 12 ? "pm" : "am";
    const displayHours = h % 12 || 12;
    return `${displayHours}:${m}${ampm}`;
  };

  const isToday = (date) => {
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isInCurrentWeek = (date) => {
    const dateStr = formatDateForApi(date);
    const weekStartStr = formatDateForApi(weekDays[0]);
    const weekEndStr = formatDateForApi(weekDays[6]);
    return dateStr >= weekStartStr && dateStr <= weekEndStr;
  };

  // Navigation based on current view
  const goToPrevious = () => {
    if (calendarView === "day") {
      const newDay = new Date(currentDay);
      newDay.setDate(newDay.getDate() - 1);
      setCurrentDay(newDay);
    } else if (calendarView === "week") {
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() - 7);
      setCurrentWeekStart(newStart);
    } else if (calendarView === "month") {
      setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
    }
  };

  const goToNext = () => {
    if (calendarView === "day") {
      const newDay = new Date(currentDay);
      newDay.setDate(newDay.getDate() + 1);
      setCurrentDay(newDay);
    } else if (calendarView === "week") {
      const newStart = new Date(currentWeekStart);
      newStart.setDate(newStart.getDate() + 7);
      setCurrentWeekStart(newStart);
    } else if (calendarView === "month") {
      setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));
    }
  };

  const goToToday = () => {
    const start = new Date(today);
    start.setDate(start.getDate() - start.getDay());
    setCurrentWeekStart(start);
    setCurrentDay(new Date(today));
    setCurrentMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setMiniCalendarDate(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const goToPreviousMiniMonth = () => {
    setMiniCalendarDate(new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth() - 1, 1));
  };

  const goToNextMiniMonth = () => {
    setMiniCalendarDate(new Date(miniCalendarDate.getFullYear(), miniCalendarDate.getMonth() + 1, 1));
  };

  const handleMiniDayClick = (date) => {
    // Set day view date
    setCurrentDay(new Date(date));
    // Set week view start
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    setCurrentWeekStart(start);
    // Set month view date
    setCurrentMonthDate(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const getEventsForDay = (date) => {
    const dateStr = formatDateForApi(date);
    return events.filter((event) => {
      const startDate = event.start_date;
      const endDate = event.end_date || event.start_date;
      return dateStr >= startDate && dateStr <= endDate;
    });
  };

  const getEventPosition = (event) => {
    if (event.all_day || !event.start_time) {
      return { top: 0, height: 60 };
    }

    const [startHour, startMin] = event.start_time.split(":").map(Number);
    const startOffset = (startHour - 7) * 60 + startMin;

    let endOffset;
    if (event.end_time) {
      const [endHour, endMin] = event.end_time.split(":").map(Number);
      endOffset = (endHour - 7) * 60 + endMin;
    } else {
      endOffset = startOffset + 60; // Default 1 hour
    }

    const top = startOffset;
    const height = Math.max(endOffset - startOffset, 30);

    return { top, height };
  };

  const getCurrentTimePosition = () => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    if (hours < 7 || hours > 20) return null;
    return (hours - 7) * 60 + minutes;
  };

  const formatCurrentTime = () => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, "0")} ${ampm}`;
  };

  const handleTimeSlotClick = (date, hour) => {
    const dateStr = formatDateForApi(date);
    const timeStr = `${String(hour).padStart(2, "0")}:00`;
    const endTimeStr = `${String(hour + 1).padStart(2, "0")}:00`;

    setEditingEvent(null);
    setEventForm({
      title: "",
      description: "",
      start_date: dateStr,
      start_time: timeStr,
      end_date: dateStr,
      end_time: endTimeStr,
      all_day: false,
      color: "#3b82f6",
    });
    setShowEventModal(true);
  };

  const handleEventClick = (event, e) => {
    e.stopPropagation();
    setEditingEvent(event);
    setEventForm({
      title: event.title,
      description: event.description || "",
      start_date: event.start_date,
      start_time: event.start_time || "",
      end_date: event.end_date || event.start_date,
      end_time: event.end_time || "",
      all_day: event.all_day || false,
      color: event.color || "#3b82f6",
    });
    setShowEventModal(true);
  };

  const handleCreateClick = () => {
    const dateStr = formatDateForApi(today);
    setEditingEvent(null);
    setEventForm({
      title: "",
      description: "",
      start_date: dateStr,
      start_time: "09:00",
      end_date: dateStr,
      end_time: "10:00",
      all_day: false,
      color: "#3b82f6",
    });
    setShowEventModal(true);
  };

  const handleCloseModal = () => {
    setShowEventModal(false);
    setEditingEvent(null);
  };

  const handleFormChange = (field, value) => {
    setEventForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleCategory = (categoryId) => {
    setActiveCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!eventForm.title.trim()) {
      showToast("Please enter an event title", "error");
      return;
    }

    try {
      const eventData = {
        title: eventForm.title.trim(),
        description: eventForm.description.trim() || null,
        start_date: eventForm.start_date,
        start_time: eventForm.all_day ? null : eventForm.start_time || null,
        end_date: eventForm.end_date || eventForm.start_date,
        end_time: eventForm.all_day ? null : eventForm.end_time || null,
        all_day: eventForm.all_day,
        color: eventForm.color,
      };

      if (editingEvent) {
        await updateMutation.mutateAsync({ id: editingEvent.id, data: eventData });
        showToast("Event updated successfully", "success");
      } else {
        await createMutation.mutateAsync(eventData);
        showToast("Event created successfully", "success");
      }

      handleCloseModal();
    } catch (error) {
      showToast(error.message || "Failed to save event", "error");
    }
  };

  const handleDelete = async () => {
    if (!editingEvent) return;

    if (!window.confirm("Are you sure you want to delete this event?")) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(editingEvent.id);
      showToast("Event deleted successfully", "success");
      handleCloseModal();
    } catch (error) {
      showToast(error.message || "Failed to delete event", "error");
    }
  };

  // Drag and drop handlers
  const handleEventDragStart = (event, e) => {
    e.stopPropagation();
    setDraggingEvent(event);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", event.id);
    // Add a slight delay to allow the drag image to be captured before adding opacity
    setTimeout(() => {
      e.target.classList.add("dragging");
    }, 0);
  };

  const handleEventDragEnd = (e) => {
    e.target.classList.remove("dragging");
    setDraggingEvent(null);
    setDragPreview(null);
  };

  const handleTimeCellDragOver = (e, date, hour, dayIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    e.currentTarget.classList.add("drag-over");

    if (!draggingEvent) return;

    // Calculate snap position
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const minuteOffset = Math.floor((relativeY / rect.height) * 60);
    const roundedMinutes = Math.round(minuteOffset / 15) * 15;
    const snappedMinutes = Math.min(Math.max(roundedMinutes, 0), 45);

    // Calculate event height (duration)
    let durationMinutes = 60;
    if (draggingEvent.start_time && draggingEvent.end_time) {
      const [startH, startM] = draggingEvent.start_time.split(":").map(Number);
      const [endH, endM] = draggingEvent.end_time.split(":").map(Number);
      durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    }

    setDragPreview({
      dayIndex,
      hour,
      minutes: snappedMinutes,
      height: durationMinutes,
    });
  };

  const handleTimeCellDragLeave = (e) => {
    e.currentTarget.classList.remove("drag-over");
  };

  const handleTimeCellDrop = async (date, hour, e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");

    if (!draggingEvent) return;

    // Calculate the precise drop position within the cell
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const minuteOffset = Math.floor((relativeY / rect.height) * 60);
    const roundedMinutes = Math.round(minuteOffset / 15) * 15; // Round to nearest 15 minutes

    const newStartHour = hour;
    const newStartMinutes = Math.min(roundedMinutes, 45); // Cap at 45 minutes

    // Calculate duration of original event
    let durationMinutes = 60; // Default 1 hour
    if (draggingEvent.start_time && draggingEvent.end_time) {
      const [startH, startM] = draggingEvent.start_time.split(":").map(Number);
      const [endH, endM] = draggingEvent.end_time.split(":").map(Number);
      durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    }

    // Calculate new end time
    const newStartTotalMinutes = newStartHour * 60 + newStartMinutes;
    const newEndTotalMinutes = newStartTotalMinutes + durationMinutes;
    const newEndHour = Math.floor(newEndTotalMinutes / 60);
    const newEndMinutes = newEndTotalMinutes % 60;

    const newStartTime = `${String(newStartHour).padStart(2, "0")}:${String(newStartMinutes).padStart(2, "0")}`;
    const newEndTime = `${String(newEndHour).padStart(2, "0")}:${String(newEndMinutes).padStart(2, "0")}`;
    const newDate = formatDateForApi(date);

    try {
      await updateMutation.mutateAsync({
        id: draggingEvent.id,
        data: {
          title: draggingEvent.title,
          description: draggingEvent.description,
          start_date: newDate,
          start_time: newStartTime,
          end_date: newDate,
          end_time: newEndTime,
          all_day: false,
          color: draggingEvent.color,
        },
      });
      showToast("Event moved successfully", "success");
    } catch (error) {
      showToast(error.message || "Failed to move event", "error");
    }

    setDraggingEvent(null);
    setDragPreview(null);
  };

  // ICS file parser
  const parseICSFile = (icsContent) => {
    const events = [];
    const lines = icsContent.split(/\r?\n/);
    let currentEvent = null;
    let currentKey = null;
    let currentValue = "";

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Handle line continuations (lines starting with space or tab)
      if (line.startsWith(" ") || line.startsWith("\t")) {
        currentValue += line.substring(1);
        continue;
      }

      // Process previous key-value pair
      if (currentKey && currentEvent) {
        processICSProperty(currentEvent, currentKey, currentValue);
      }

      // Parse new line
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      currentKey = line.substring(0, colonIndex);
      currentValue = line.substring(colonIndex + 1);

      // Handle BEGIN/END
      if (currentKey === "BEGIN" && currentValue === "VEVENT") {
        currentEvent = {};
        currentKey = null;
      } else if (currentKey === "END" && currentValue === "VEVENT") {
        if (currentEvent && currentEvent.title) {
          events.push(currentEvent);
        }
        currentEvent = null;
        currentKey = null;
      }
    }

    return events;
  };

  const processICSProperty = (event, key, value) => {
    // Remove parameters from key (e.g., DTSTART;TZID=America/New_York)
    const baseKey = key.split(";")[0];

    switch (baseKey) {
      case "SUMMARY":
        event.title = unescapeICS(value);
        break;
      case "DESCRIPTION":
        event.description = unescapeICS(value);
        break;
      case "DTSTART":
        const start = parseICSDateTime(value);
        if (start) {
          event.start_date = start.date;
          event.start_time = start.time;
          event.all_day = start.allDay;
        }
        break;
      case "DTEND":
        const end = parseICSDateTime(value);
        if (end) {
          event.end_date = end.date;
          event.end_time = end.time;
        }
        break;
      default:
        break;
    }
  };

  const parseICSDateTime = (value) => {
    // Handle all-day events (DATE only, no time): 20240120
    if (/^\d{8}$/.test(value)) {
      const year = value.substring(0, 4);
      const month = value.substring(4, 6);
      const day = value.substring(6, 8);
      return {
        date: `${year}-${month}-${day}`,
        time: null,
        allDay: true,
      };
    }

    // Handle datetime: 20240120T090000 or 20240120T090000Z
    const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (match) {
      const [, year, month, day, hour, minute] = match;
      const isUTC = match[7] === "Z";

      let date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute)
      );

      // If UTC, convert to local time
      if (isUTC) {
        date = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
      }

      return {
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
        allDay: false,
      };
    }

    return null;
  };

  const unescapeICS = (value) => {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".ics")) {
      showToast("Please select a valid .ics file", "error");
      return;
    }

    setIsImporting(true);

    try {
      const content = await file.text();
      const parsedEvents = parseICSFile(content);

      if (parsedEvents.length === 0) {
        showToast("No events found in the file", "error");
        setIsImporting(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const event of parsedEvents) {
        try {
          await createMutation.mutateAsync({
            title: event.title || "Untitled Event",
            description: event.description || null,
            start_date: event.start_date,
            start_time: event.all_day ? null : event.start_time,
            end_date: event.end_date || event.start_date,
            end_time: event.all_day ? null : event.end_time,
            all_day: event.all_day || false,
            color: "#3b82f6",
          });
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (successCount > 0) {
        showToast(`Imported ${successCount} event${successCount > 1 ? "s" : ""} successfully`, "success");
      }
      if (errorCount > 0) {
        showToast(`Failed to import ${errorCount} event${errorCount > 1 ? "s" : ""}`, "error");
      }
    } catch (error) {
      showToast("Failed to parse ICS file", "error");
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const getDateRangeHeader = () => {
    if (calendarView === "day") {
      return `${MONTHS[currentDay.getMonth()]} ${currentDay.getDate()}, ${currentDay.getFullYear()}`;
    } else if (calendarView === "month") {
      return `${MONTHS[currentMonthDate.getMonth()]} ${currentMonthDate.getFullYear()}`;
    } else {
      // Week view
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth()) {
        return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} - ${end.getDate()}`;
      }
      return `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()} - ${MONTHS_SHORT[end.getMonth()]} ${end.getDate()}`;
    }
  };

  const currentTimePos = getCurrentTimePosition();
  const showCurrentTimeLine = currentTimePos !== null && weekDays.some(d => isToday(d));

  return (
    <div className="calendar-layout">
      {/* Sidebar */}
      <aside className="calendar-sidebar">
        <div className="sidebar-actions">
          <button className="calendar-create-btn" onClick={handleCreateClick}>
            <Plus size={18} />
            <span>Create</span>
          </button>
          <button
            className="calendar-import-btn"
            onClick={handleImportClick}
            disabled={isImporting}
          >
            <Upload size={16} />
            <span>{isImporting ? "Importing..." : "Import"}</span>
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          accept=".ics"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />

        {/* Mini Calendar */}
        <div className="mini-calendar">
          <div className="mini-calendar-header">
            <span className="mini-calendar-title">
              {MONTHS[miniCalendarDate.getMonth()]} {miniCalendarDate.getFullYear()}
            </span>
            <div className="mini-calendar-nav">
              <button onClick={goToPreviousMiniMonth}>
                <ChevronLeft size={16} />
              </button>
              <button onClick={goToNextMiniMonth}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="mini-calendar-weekdays">
            {DAYS_SHORT.map((day, i) => (
              <span key={i}>{day}</span>
            ))}
          </div>
          <div className="mini-calendar-days">
            {miniCalendarDays.map((day, index) => (
              <button
                key={index}
                className={`mini-day ${!day.isCurrentMonth ? "other-month" : ""} ${isToday(day.date) ? "today" : ""} ${isInCurrentWeek(day.date) ? "in-week" : ""}`}
                onClick={() => handleMiniDayClick(day.date)}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar Categories */}
        <div className="calendar-categories">
          <div className="categories-header">
            <span>Calendars</span>
          </div>
          <div className="categories-list">
            {CALENDAR_CATEGORIES.map((category) => (
              <label key={category.id} className="category-item">
                <input
                  type="checkbox"
                  checked={activeCategories.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                  style={{ accentColor: category.color }}
                />
                <span className="category-color" style={{ backgroundColor: category.color }} />
                <span className="category-name">{category.name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Google Calendar Integration */}
        <GoogleCalendarButton showToast={showToast} />
      </aside>

      {/* Main Calendar */}
      <main className="calendar-main">
        {/* Header */}
        <header className="calendar-header">
          <div className="calendar-header-left">
            <button className="nav-arrow" onClick={goToPrevious}>
              <ChevronLeft size={20} />
            </button>
            <button className="today-btn" onClick={goToToday}>
              Today
            </button>
            <button className="nav-arrow" onClick={goToNext}>
              <ChevronRight size={20} />
            </button>
            <h2 className="date-range">{getDateRangeHeader()}</h2>
          </div>
          <div className="calendar-header-right">
            <button className="header-icon-btn">
              <Search size={18} />
            </button>
            <div className="view-selector-container" ref={viewDropdownRef}>
              <button
                className="view-selector"
                onClick={() => setShowViewDropdown(!showViewDropdown)}
              >
                <span>{calendarView.charAt(0).toUpperCase() + calendarView.slice(1)}</span>
                <ChevronLeft size={14} style={{ transform: showViewDropdown ? "rotate(90deg)" : "rotate(-90deg)" }} />
              </button>
              {showViewDropdown && (
                <div className="view-dropdown">
                  <button
                    className={`view-option ${calendarView === "day" ? "active" : ""}`}
                    onClick={() => { setCalendarView("day"); setShowViewDropdown(false); }}
                  >
                    Day
                  </button>
                  <button
                    className={`view-option ${calendarView === "week" ? "active" : ""}`}
                    onClick={() => { setCalendarView("week"); setShowViewDropdown(false); }}
                  >
                    Week
                  </button>
                  <button
                    className={`view-option ${calendarView === "month" ? "active" : ""}`}
                    onClick={() => { setCalendarView("month"); setShowViewDropdown(false); }}
                  >
                    Month
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Day View */}
        {calendarView === "day" && (
          <div className="day-view-grid">
            {/* Day Header */}
            <div className="day-view-header">
              <div className="time-gutter-header">
                <span className="gmt-label">GMT-5</span>
              </div>
              <div className={`day-header single-day ${isToday(currentDay) ? "today" : ""}`}>
                <span className="day-name">{DAYS_OF_WEEK[currentDay.getDay()]}</span>
                <span className={`day-number ${isToday(currentDay) ? "today-number" : ""}`}>
                  {currentDay.getDate()}
                </span>
              </div>
            </div>

            {/* All Day Row */}
            <div className="all-day-row day-view-all-day">
              <div className="time-gutter">
                <span>ALL-DAY</span>
              </div>
              <div className="all-day-cell single-day-cell">
                {getEventsForDay(currentDay).filter(e => e.all_day).map((event) => (
                  <div
                    key={event.id}
                    className="all-day-event"
                    style={{ backgroundColor: event.color || "#3b82f6" }}
                    onClick={(e) => handleEventClick(event, e)}
                  >
                    {event.title}
                  </div>
                ))}
              </div>
            </div>

            {/* Time Grid */}
            <div className="time-grid-container">
              <div className="time-grid day-view-time-grid">
                {HOURS.map((hour) => (
                  <div key={hour} className="time-row">
                    <div className="time-gutter">
                      <span>{formatTimeDisplay(hour)}</span>
                    </div>
                    <div
                      className="time-cell single-day-cell"
                      onClick={() => handleTimeSlotClick(currentDay, hour)}
                    />
                  </div>
                ))}

                {/* Current Time Line */}
                {isToday(currentDay) && currentTimePos !== null && (
                  <div
                    className="current-time-line day-view-time-line"
                    style={{ top: `${currentTimePos}px` }}
                  >
                    <span className="current-time-label">{formatCurrentTime()}</span>
                    <div className="current-time-dot" />
                    <div className="current-time-bar" />
                  </div>
                )}

                {/* Events Layer */}
                <div className="events-layer day-view-events">
                  <div className="day-events-column" style={{ left: '60px', width: 'calc(100% - 60px)' }}>
                    {getEventsForDay(currentDay).filter(e => !e.all_day && e.start_time).map((event) => {
                      const { top, height } = getEventPosition(event);
                      return (
                        <div
                          key={event.id}
                          className="week-event"
                          style={{
                            backgroundColor: event.color || "#3b82f6",
                            top: `${top}px`,
                            height: `${height}px`,
                          }}
                          onClick={(e) => handleEventClick(event, e)}
                        >
                          <div className="week-event-title">{event.title}</div>
                          <div className="week-event-time">
                            {formatEventTime(event.start_time)} - {formatEventTime(event.end_time)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Week View */}
        {calendarView === "week" && (
          <div className="week-grid">
            {/* Day Headers */}
            <div className="week-header">
              <div className="time-gutter-header">
                <span className="gmt-label">GMT-5</span>
              </div>
              {weekDays.map((date, index) => (
                <div key={index} className={`day-header ${isToday(date) ? "today" : ""}`}>
                  <span className="day-name">{DAYS_OF_WEEK[date.getDay()]}</span>
                  <span className={`day-number ${isToday(date) ? "today-number" : ""}`}>
                    {date.getDate()}
                  </span>
                </div>
              ))}
            </div>

            {/* All Day Row */}
            <div className="all-day-row">
              <div className="time-gutter">
                <span>ALL-DAY</span>
              </div>
              {weekDays.map((date, index) => {
                const dayEvents = getEventsForDay(date).filter(e => e.all_day);
                return (
                  <div key={index} className="all-day-cell">
                    {dayEvents.map((event) => (
                      <div
                        key={event.id}
                        className="all-day-event"
                        style={{ backgroundColor: event.color || "#3b82f6" }}
                        onClick={(e) => handleEventClick(event, e)}
                      >
                        {event.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div className="time-grid-container">
              <div className="time-grid">
                {HOURS.map((hour) => (
                  <div key={hour} className="time-row">
                    <div className="time-gutter">
                      <span>{formatTimeDisplay(hour)}</span>
                    </div>
                    {weekDays.map((date, dayIndex) => (
                      <div
                        key={dayIndex}
                        className="time-cell"
                        onClick={() => handleTimeSlotClick(date, hour)}
                        onDragOver={(e) => handleTimeCellDragOver(e, date, hour, dayIndex)}
                        onDragLeave={handleTimeCellDragLeave}
                        onDrop={(e) => handleTimeCellDrop(date, hour, e)}
                      />
                    ))}
                  </div>
                ))}

                {/* Current Time Line */}
                {showCurrentTimeLine && (
                  <div
                    className="current-time-line"
                    style={{ top: `${currentTimePos}px` }}
                  >
                    <span className="current-time-label">{formatCurrentTime()}</span>
                    <div className="current-time-dot" />
                    <div className="current-time-bar" />
                  </div>
                )}

                {/* Events Layer */}
                <div className="events-layer">
                  {weekDays.map((date, dayIndex) => {
                    const dayEvents = getEventsForDay(date).filter(e => !e.all_day && e.start_time);
                    return (
                      <div key={dayIndex} className="day-events-column" style={{ left: `calc(60px + ${dayIndex} * ((100% - 60px) / 7))`, width: `calc((100% - 60px) / 7)` }}>
                        {dayEvents.map((event) => {
                          const { top, height } = getEventPosition(event);
                          return (
                            <div
                              key={event.id}
                              className={`week-event ${draggingEvent?.id === event.id ? "dragging" : ""}`}
                              style={{
                                backgroundColor: event.color || "#3b82f6",
                                top: `${top}px`,
                                height: `${height}px`,
                              }}
                              draggable
                              onDragStart={(e) => handleEventDragStart(event, e)}
                              onDragEnd={handleEventDragEnd}
                              onClick={(e) => handleEventClick(event, e)}
                            >
                              <div className="week-event-title">{event.title}</div>
                              <div className="week-event-time">
                                {formatEventTime(event.start_time)} - {formatEventTime(event.end_time)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Drag Preview Ghost */}
                  {dragPreview && draggingEvent && (
                    <div
                      className="drag-preview-ghost"
                      style={{
                        left: `calc(60px + ${dragPreview.dayIndex} * ((100% - 60px) / 7))`,
                        width: `calc((100% - 60px) / 7)`,
                        top: `${(dragPreview.hour - 7) * 60 + dragPreview.minutes}px`,
                        height: `${Math.max(dragPreview.height, 30)}px`,
                        backgroundColor: draggingEvent.color || "#3b82f6",
                      }}
                    >
                      <div className="drag-preview-title">{draggingEvent.title}</div>
                      <div className="drag-preview-time">
                        {`${dragPreview.hour % 12 || 12}:${String(dragPreview.minutes).padStart(2, "0")}${dragPreview.hour >= 12 ? "pm" : "am"}`}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Month View */}
        {calendarView === "month" && (
          <div className="month-view-grid">
            {/* Weekday Headers */}
            <div className="month-weekday-header">
              {DAYS_OF_WEEK.map((day, index) => (
                <div key={index} className="month-weekday">{day}</div>
              ))}
            </div>

            {/* Month Days Grid */}
            <div className="month-days-grid">
              {monthViewDays.map((day, index) => {
                const dayEvents = getEventsForDay(day.date);
                const maxEventsToShow = 3;
                const visibleEvents = dayEvents.slice(0, maxEventsToShow);
                const remainingCount = dayEvents.length - maxEventsToShow;

                return (
                  <div
                    key={index}
                    className={`month-day-cell ${!day.isCurrentMonth ? "other-month" : ""} ${isToday(day.date) ? "today" : ""}`}
                    onClick={() => handleTimeSlotClick(day.date, 9)}
                  >
                    <span className={`month-day-number ${isToday(day.date) ? "today-number" : ""}`}>
                      {day.date.getDate()}
                    </span>
                    <div className="month-day-events">
                      {visibleEvents.map((event) => (
                        <div
                          key={event.id}
                          className="month-event"
                          style={{ backgroundColor: event.color || "#3b82f6" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(event, e);
                          }}
                        >
                          {event.all_day ? (
                            <span className="month-event-title">{event.title}</span>
                          ) : (
                            <>
                              <span className="month-event-time">{formatEventTime(event.start_time)}</span>
                              <span className="month-event-title">{event.title}</span>
                            </>
                          )}
                        </div>
                      ))}
                      {remainingCount > 0 && (
                        <div className="month-more-events">
                          +{remainingCount} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Event Modal */}
      {showEventModal && (
        <div className="calendar-modal-overlay" onClick={handleCloseModal}>
          <div className="calendar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="calendar-modal-header">
              <h3>{editingEvent ? "Edit Event" : "New Event"}</h3>
              <button className="calendar-modal-close" onClick={handleCloseModal}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="calendar-event-form">
              <div className="form-group">
                <label htmlFor="title">Title *</label>
                <input
                  id="title"
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => handleFormChange("title", e.target.value)}
                  placeholder="Event title"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  value={eventForm.description}
                  onChange={(e) => handleFormChange("description", e.target.value)}
                  placeholder="Event description (optional)"
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="start_date">Start Date *</label>
                  <input
                    id="start_date"
                    type="date"
                    value={eventForm.start_date}
                    onChange={(e) => handleFormChange("start_date", e.target.value)}
                  />
                </div>
                {!eventForm.all_day && (
                  <div className="form-group">
                    <label htmlFor="start_time">Start Time</label>
                    <input
                      id="start_time"
                      type="time"
                      value={eventForm.start_time}
                      onChange={(e) => handleFormChange("start_time", e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="end_date">End Date</label>
                  <input
                    id="end_date"
                    type="date"
                    value={eventForm.end_date}
                    onChange={(e) => handleFormChange("end_date", e.target.value)}
                    min={eventForm.start_date}
                  />
                </div>
                {!eventForm.all_day && (
                  <div className="form-group">
                    <label htmlFor="end_time">End Time</label>
                    <input
                      id="end_time"
                      type="time"
                      value={eventForm.end_time}
                      onChange={(e) => handleFormChange("end_time", e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="form-group checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={eventForm.all_day}
                    onChange={(e) => handleFormChange("all_day", e.target.checked)}
                  />
                  <span>All day event</span>
                </label>
              </div>

              <div className="form-group">
                <label>Color</label>
                <div className="color-picker">
                  {EVENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={`color-option ${eventForm.color === color.value ? "selected" : ""}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => handleFormChange("color", color.value)}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>

              <div className="calendar-modal-actions">
                {editingEvent && (
                  <button
                    type="button"
                    className="calendar-delete-btn"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </button>
                )}
                <div className="calendar-modal-actions-right">
                  <button type="button" className="calendar-cancel-btn" onClick={handleCloseModal}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="calendar-save-btn"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {editingEvent ? (
                      <>
                        <Edit2 size={16} />
                        <span>Update</span>
                      </>
                    ) : (
                      <>
                        <Plus size={16} />
                        <span>Create</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
