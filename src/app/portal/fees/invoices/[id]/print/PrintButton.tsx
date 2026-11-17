"use client";

export function PrintButton() {
  return (
    <div className="no-print" style={{ textAlign: "center", margin: "1.5rem auto 0" }}>
      <button
        onClick={() => window.print()}
        style={{
          background: "#4f46e5",
          color: "white",
          border: "none",
          padding: "10px 28px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
