import { useState, useMemo, useCallback } from "react";

interface CalendarViewProps {
  onSelectDate: (dateStr: string) => void;
  onClose: () => void;
  notesWithDates: Set<string>; // Set of "YYYY-MM-DD" date strings that have notes
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarView({ onSelectDate, onClose, notesWithDates }: CalendarViewProps) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: Array<{
      day: number;
      month: "prev" | "current" | "next";
      dateStr: string;
      hasNote: boolean;
      isToday: boolean;
    }> = [];

    // Prev month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        day,
        month: "prev",
        dateStr,
        hasNote: notesWithDates.has(dateStr),
        isToday: false,
      });
    }

    // Current month
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        day,
        month: "current",
        dateStr,
        hasNote: notesWithDates.has(dateStr),
        isToday: dateStr === todayStr,
      });
    }

    // Next month days (fill to 42 cells = 6 weeks)
    const remaining = 42 - days.length;
    for (let day = 1; day <= remaining; day++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({
        day,
        month: "next",
        dateStr,
        hasNote: notesWithDates.has(dateStr),
        isToday: false,
      });
    }

    return days;
  }, [year, month, notesWithDates]);

  const goToPrevMonth = useCallback(() => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }, []);

  const goToNextMonth = useCallback(() => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  }, []);

  const handleDateClick = useCallback(
    (dateStr: string) => {
      onSelectDate(dateStr);
    },
    [onSelectDate],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[380px] rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <button
            onClick={goToPrevMonth}
            className="p-1 rounded hover:opacity-70 transition-opacity text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-sm">
              {MONTHS[month]} {year}
            </h2>
            <button
              onClick={goToToday}
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              Today
            </button>
          </div>
          <button
            onClick={goToNextMonth}
            className="p-1 rounded hover:opacity-70 transition-opacity text-lg"
            style={{ color: "var(--text-secondary)" }}
          >
            →
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 text-center py-2 border-b" style={{ borderColor: "var(--border-color)" }}>
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d}
              className="text-[10px] font-semibold uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 p-2 gap-1">
          {calendarDays.map((d, i) => (
            <button
              key={i}
              onClick={() => handleDateClick(d.dateStr)}
              className="relative aspect-square rounded flex items-center justify-center text-sm transition-colors hover:opacity-80"
              style={{
                color:
                  d.isToday
                    ? "#fff"
                    : d.month === "current"
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                backgroundColor: d.isToday
                  ? "var(--accent-color, #3b82f6)"
                  : "transparent",
                fontWeight: d.isToday ? 600 : 400,
              }}
              title={d.dateStr}
            >
              {d.day}
              {d.hasNote && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{
                    backgroundColor: d.isToday ? "#fff" : "var(--accent-color, #3b82f6)",
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-2 border-t text-xs"
          style={{ borderColor: "var(--border-color)", color: "var(--text-muted)" }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: "var(--accent-color, #3b82f6)" }}
            />
            Has notes
          </div>
          <span>Click date to open daily note</span>
        </div>
      </div>
    </div>
  );
}