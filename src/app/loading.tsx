export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="px-6 pt-6">
      <div className="h-8 w-40 rounded-[4px] bg-raise" />
      <div className="mt-3 h-3 w-72 rounded-[3px] bg-raise" />
      <div className="mt-6 h-[74px] rounded-[10px] bg-surface" />
      <div className="mt-6 h-64 rounded-[10px] bg-surface" />
    </div>
  );
}
