// App-styled date picker — Radix Popover trigger + small month-grid calendar.
// Replaces `<input type="date">`, which the native browsers render in their
// own visual language (Safari's especially clashes) and which bit us last
// week with an onChange-on-blur quirk.
//
// API mirrors a controlled input: pass `value` as YYYY-MM-DD, get
// `onChange(YYYY-MM-DD)` when the user picks a day. Empty string clears.

import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useColors } from "@/App";

interface DatePickerProps {
  value: string; // YYYY-MM-DD; empty string = unset
  onChange: (value: string) => void;
  /** Optional accessible label for the trigger button. */
  ariaLabel?: string;
  /** Optional placeholder to show when value is empty. */
  placeholder?: string;
  /** Optional className applied to the trigger button (for layout). */
  className?: string;
}

// Parse YYYY-MM-DD as a local-noon Date so display-day matches input-day
// across timezones (mirrors toNoonUTC convention used by the rest of the app).
function parseLocal(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, "yyyy-MM-dd", new Date());
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function DatePicker({ value, onChange, ariaLabel, placeholder = "Pick a date", className }: DatePickerProps) {
  const C = useColors();
  const selected = parseLocal(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => selected ?? new Date());
  const gridRef = useRef<HTMLDivElement>(null);

  // Keep the visible month anchored to the selected value whenever it changes
  // from outside (e.g. resetting to original date on Cancel).
  useEffect(() => {
    if (selected) setViewMonth(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Build the 6-week visible grid (always 42 cells so the popover doesn't
  // jump height when months have different week counts).
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(addDays(start, 41), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const pick = (d: Date) => {
    onChange(toIso(d));
    setOpen(false);
  };

  // Keyboard navigation inside the grid: arrow keys move by day, Enter selects,
  // Escape closes. The first focusable day mounts focused when the popover opens.
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    if (!gridRef.current) return;
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || !gridRef.current.contains(focused)) return;
    const day = focused.dataset.day;
    if (!day) return;
    let next: Date | null = null;
    const cur = parseLocal(day);
    if (!cur) return;
    if (e.key === "ArrowLeft") next = addDays(cur, -1);
    else if (e.key === "ArrowRight") next = addDays(cur, 1);
    else if (e.key === "ArrowUp") next = addDays(cur, -7);
    else if (e.key === "ArrowDown") next = addDays(cur, 7);
    else if (e.key === "Enter") {
      e.preventDefault();
      pick(cur);
      return;
    }
    if (next) {
      e.preventDefault();
      // If we crossed a month boundary, flip the view.
      if (!isSameMonth(next, viewMonth)) setViewMonth(next);
      // Defer focus to next tick so the new buttons exist.
      const targetIso = toIso(next);
      requestAnimationFrame(() => {
        const btn = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${targetIso}"]`);
        btn?.focus();
      });
    }
  };

  const triggerLabel = selected ? format(selected, "MMM d, yyyy") : placeholder;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel ?? "Select date"}
          className={`text-xs px-1.5 py-1 outline-none w-[120px] flex-shrink-0 font-[Montserrat] text-left transition-colors hover:opacity-80 ${className ?? ""}`}
          style={{
            border: `1px solid ${C.accent}40`,
            borderRadius: 8,
            color: selected ? C.accentDark : C.muted,
            backgroundColor: C.accentLight,
          }}
        >
          {triggerLabel}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-xl shadow-lg"
          style={{
            backgroundColor: "white",
            border: `1px solid ${C.border}`,
            padding: "0.75rem",
            fontFamily: "Montserrat, sans-serif",
            color: C.text,
            width: 280,
          }}
          onOpenAutoFocus={(e) => {
            // Don't auto-focus the first focusable element — focus a sensible
            // day cell instead (selected, or today, or first of month).
            e.preventDefault();
            requestAnimationFrame(() => {
              const target = selected ?? new Date();
              const targetIso = toIso(target);
              const btn = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${targetIso}"]`);
              (btn ?? gridRef.current?.querySelector<HTMLButtonElement>(`[data-day]`))?.focus();
            });
          }}
        >
          {/* Month header */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="p-1 rounded hover:opacity-70 transition-opacity"
              style={{ color: C.muted }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-[13px] font-semibold" style={{ color: C.text }}>
              {format(viewMonth, "MMMM yyyy")}
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="p-1 rounded hover:opacity-70 transition-opacity"
              style={{ color: C.muted }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div
                key={i}
                className="text-[10px] font-semibold uppercase tracking-wider text-center"
                style={{ color: C.muted }}
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div ref={gridRef} className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKeyDown}>
            {days.map((d) => {
              const inMonth = isSameMonth(d, viewMonth);
              const isSelected = selected && isSameDay(d, selected);
              const today = isToday(d);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  data-day={toIso(d)}
                  onClick={() => pick(d)}
                  tabIndex={inMonth ? 0 : -1}
                  className="text-[12px] h-9 rounded flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2"
                  style={{
                    color: isSelected ? "white" : inMonth ? C.text : C.border,
                    backgroundColor: isSelected ? C.accentDark : "transparent",
                    fontWeight: isSelected || today ? 600 : 400,
                    border: today && !isSelected ? `1px solid ${C.accent}80` : "1px solid transparent",
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer with Today shortcut + Clear */}
          <div
            className="flex items-center justify-between mt-2 pt-2 text-[11px]"
            style={{ borderTop: `1px dashed ${C.border}` }}
          >
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="font-medium transition-opacity hover:opacity-70"
              style={{ color: C.accentDark }}
            >
              Today
            </button>
            {selected && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="transition-opacity hover:opacity-70"
                style={{ color: C.muted }}
              >
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
