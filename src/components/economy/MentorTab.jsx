import MentorCard from "../mentor/MentorCard.jsx";

export default function MentorTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MentorCard variant="full" />
    </div>
  );
}
