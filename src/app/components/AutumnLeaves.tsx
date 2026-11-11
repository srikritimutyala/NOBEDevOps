import React from "react";

export default function AutumnLeaves() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
      style={{ opacity: 0.85 }}
    >
      {/* Leaf 1 - Maple Amber */}
      <span
        className="fall-leaf leaf-1"
        style={{
          left: "6%",
          animationDuration: "22s",
          animationDelay: "0s",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#c2410c">
          <path d="M12 2L13.5 7L17 5L15.5 9.5L20 10L16.5 13L19 17L14 16L12 21L10 16L5 17L7.5 13L4 10L8.5 9.5L7 5L10.5 7L12 2Z" />
        </svg>
      </span>

      {/* Leaf 2 - Golden Oak */}
      <span
        className="fall-leaf leaf-2"
        style={{
          left: "22%",
          animationDuration: "26s",
          animationDelay: "4s",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#d97706">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
        </svg>
      </span>

      {/* Leaf 3 - Burnt Crimson */}
      <span
        className="fall-leaf leaf-3"
        style={{
          left: "45%",
          animationDuration: "20s",
          animationDelay: "9s",
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="#b91c1c">
          <path d="M12 2L13.5 7L17 5L15.5 9.5L20 10L16.5 13L19 17L14 16L12 21L10 16L5 17L7.5 13L4 10L8.5 9.5L7 5L10.5 7L12 2Z" />
        </svg>
      </span>

      {/* Leaf 4 - Forest Bronze */}
      <span
        className="fall-leaf leaf-4"
        style={{
          left: "68%",
          animationDuration: "24s",
          animationDelay: "2s",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#78350f">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
        </svg>
      </span>

      {/* Leaf 5 - Harvest Honey */}
      <span
        className="fall-leaf leaf-5"
        style={{
          left: "85%",
          animationDuration: "28s",
          animationDelay: "7s",
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="#ea580c">
          <path d="M12 2L13.5 7L17 5L15.5 9.5L20 10L16.5 13L19 17L14 16L12 21L10 16L5 17L7.5 13L4 10L8.5 9.5L7 5L10.5 7L12 2Z" />
        </svg>
      </span>

      {/* Leaf 6 - Cedar Amber */}
      <span
        className="fall-leaf leaf-6"
        style={{
          left: "94%",
          animationDuration: "21s",
          animationDelay: "12s",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#d97706">
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22L6.66 19.7C7.14 19.87 7.64 20 8 20C19 20 22 3 22 3C21 5 14 5.25 9 6.25C4 7.25 2 11.5 2 13.5C2 15.5 3.75 17.25 3.75 17.25C7 8 17 8 17 8Z" />
        </svg>
      </span>
    </div>
  );
}
