import { supabase } from "../services/supabase";

export async function deleteOrderById(orderId) {
  const { error: reportsError } = await supabase
    .from("reports")
    .delete()
    .eq("order_id", orderId);

  if (reportsError) {
    throw reportsError;
  }

  const { data: boxes, error: boxesError } = await supabase
    .from("boxes")
    .select("box_id")
    .eq("order_id", orderId);

  if (boxesError) {
    throw boxesError;
  }

  const boxIds = (boxes ?? []).map((box) => box.box_id);

  if (boxIds.length > 0) {
    const { error: orderItemsError } = await supabase
      .from("order_items")
      .delete()
      .in("box_id", boxIds);

    if (orderItemsError) {
      throw orderItemsError;
    }

    const { error: deleteBoxesError } = await supabase
      .from("boxes")
      .delete()
      .in("box_id", boxIds);

    if (deleteBoxesError) {
      throw deleteBoxesError;
    }
  }

  const { error: deleteOrdersError } = await supabase
    .from("orders")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrdersError) {
    throw deleteOrdersError;
  }
}
