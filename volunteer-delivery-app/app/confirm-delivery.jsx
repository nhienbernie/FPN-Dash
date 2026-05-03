import { useState } from "react";
import { Alert, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import AppButton from "../components/AppButton";
import ReportConcernModal from "../components/ReportConcernModal";
import {
  attachDeliveryProof,
  buildRelinquishmentNotes,
  parseOrderNotes,
} from "../lib/orderSelectionWorkaround";
import { ACTIVE_VOLUNTEER_STATUSES, ORDER_STATUS } from "../lib/orderStatus";
import { supabase } from "../services/supabase";
import { theme } from "../theme";

const DELIVERY_PROOF_BUCKET = "delivery-proofs";

function inferImageMimeType(asset) {
  const explicitType = String(asset?.mimeType ?? "").toLowerCase();
  if (explicitType.startsWith("image/")) {
    return explicitType;
  }

  const uri = String(asset?.uri ?? "").toLowerCase();
  if (uri.includes(".png")) return "image/png";
  if (uri.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function getImageExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function readPhotoAsArrayBuffer(asset, contentType) {
  const uri = asset?.uri;
  if (!uri) {
    throw new Error("Missing proof photo URI.");
  }

  if (/^data:/i.test(uri)) {
    const base64 = uri.split(",")[1] ?? "";
    return base64ToArrayBuffer(base64);
  }

  if (/^(https?:|blob:)/i.test(uri)) {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToArrayBuffer(base64);
}

async function uploadDeliveryProofPhoto({ asset, orderId, volunteerUid }) {
  if (/^https?:/i.test(asset?.uri ?? "")) {
    return asset.uri;
  }

  const contentType = inferImageMimeType(asset);
  const extension = getImageExtension(contentType);
  const safeVolunteerUid = String(volunteerUid ?? "volunteer").replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `orders/${orderId}/${safeVolunteerUid}-${Date.now()}.${extension}`;
  const imageData = await readPhotoAsArrayBuffer(asset, contentType);

  const { error: uploadError } = await supabase.storage
    .from(DELIVERY_PROOF_BUCKET)
    .upload(path, imageData, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(DELIVERY_PROOF_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error("Unable to create a public delivery proof URL.");
  }

  return data.publicUrl;
}

export default function ConfirmDelivery() {
  const router = useRouter();
  const { name = "", address = "", order } = useLocalSearchParams();
  const [orderDetails] = useState(() => {
    if (!order) return {};

    try {
      return JSON.parse(order);
    } catch {
      return {};
    }
  });
  const [modalVisible, setModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [proofPhoto, setProofPhoto] = useState(() => {
    const existingPhotoUri = parseOrderNotes(orderDetails.notes).deliveryProof?.photoUri ?? null;
    return existingPhotoUri ? { uri: existingPhotoUri } : null;
  });
  const proofPhotoUri = proofPhoto?.uri ?? null;
  const [proofUploadMessage, setProofUploadMessage] = useState(
    "Photo will be saved securely when you confirm delivery.",
  );
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);

  const displayDate = orderDetails.delivery_date || orderDetails.created_at || "";
  const parsedNotes = parseOrderNotes(orderDetails.notes);
  const fallbackItems = [
    orderDetails.item_milk ? "Milk" : null,
    orderDetails.item_pb ? "Peanut butter" : null,
    orderDetails.item_mac_cheese ? "Mac & cheese" : null,
  ].filter(Boolean);
  const itemsToShow =
    parsedNotes.selectedItems.length > 0 ? parsedNotes.selectedItems : fallbackItems;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;

  const openMaps = () => {
    Linking.openURL(mapsUrl).catch((error) =>
      console.error("Failed to open maps", error)
    );
  };

  const handleTakePhoto = async () => {
    setPickingPhoto(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Camera permission required",
          "Allow camera access in settings to attach delivery proof.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const asset = result.assets[0];
        setProofPhoto({
          uri: asset.uri,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
        });
        setProofUploadMessage("Photo ready. It will be uploaded when delivery is confirmed.");
      }
    } catch (err) {
      console.warn("[proof] Camera failed:", err.message);
      Alert.alert(
        "Camera unavailable",
        "We could not open the camera. Please try again before confirming delivery.",
      );
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleOpenConfirmDelivery = () => {
    if (!proofPhotoUri) {
      Alert.alert(
        "Proof photo required",
        "Take a delivery proof photo before marking this order delivered.",
      );
      return;
    }

    setModalVisible(true);
  };

  const handleConfirmDelivery = async () => {
    if (!orderDetails.order_id) return;
    if (!proofPhotoUri) {
      Alert.alert(
        "Proof photo required",
        "Take a delivery proof photo before marking this order delivered.",
      );
      return;
    }

    setSavingDelivery(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        Alert.alert("Session expired", "Sign in again before confirming delivery.");
        return;
      }

      setProofUploadMessage("Uploading proof photo...");
      const proofPhotoUrl = await uploadDeliveryProofPhoto({
        asset: proofPhoto,
        orderId: orderDetails.order_id,
        volunteerUid: user.id,
      });
      const updatedNotes = attachDeliveryProof(orderDetails.notes, proofPhotoUrl);

      const { data, error } = await supabase
        .from("orders")
        .update({ status: ORDER_STATUS.DELIVERED, notes: updatedNotes })
        .eq("order_id", orderDetails.order_id)
        .eq("volunteer_uid", user.id)
        .in("status", ACTIVE_VOLUNTEER_STATUSES)
        .select("order_id")
        .maybeSingle();

      if (error) {
        console.error("Error updating order:", error);
        Alert.alert("Error", "Unable to confirm this delivery right now.");
        return;
      }

      if (!data) {
        Alert.alert(
          "Order Changed",
          "This delivery changed in another session. Refreshing your dashboard.",
        );
        router.replace("/volunteer-dashboard");
        return;
      }

      setModalVisible(false);
      router.replace("/volunteer-dashboard");
    } catch (error) {
      console.error("Error saving delivery proof:", error);
      Alert.alert(
        "Proof upload failed",
        error.message || "Unable to save the delivery proof photo right now.",
      );
    } finally {
      setSavingDelivery(false);
    }
  };

  const handleCancelDelivery = async () => {
    if (!orderDetails.order_id) return;

    const nextNotes = buildRelinquishmentNotes(
      orderDetails.notes,
      orderDetails.volunteer_uid,
    );

    const { error } = await supabase
      .from("orders")
      .update({ status: "pending", volunteer_uid: null, notes: nextNotes })
      .eq("order_id", orderDetails.order_id);

    if (error) {
      console.error("Error updating order:", error);
      return;
    }

    setCancelModalVisible(false);
    router.push("/volunteer-dashboard");
  };

  return (
    <View style={styles.container}>
      <View style={styles.infoContainer}>
        <Text style={styles.nameText}>{name || "Recipient Name"}</Text>
        {displayDate ? (
          <Text style={styles.dateText}>
            {new Date(displayDate).toLocaleDateString()}
          </Text>
        ) : null}
        <TouchableOpacity onPress={openMaps}>
          <Text style={styles.addressText}>{address || "Delivery address"}</Text>
        </TouchableOpacity>

        {itemsToShow.length > 0 ? (
          <Text style={styles.detailText}>Items: {itemsToShow.join(", ")}</Text>
        ) : null}
        <Text style={styles.detailText}>
          Notes: {parsedNotes.userNotes || "None"}
        </Text>

        <View style={styles.proofSection}>
          <Text style={styles.proofLabel}>Delivery proof required</Text>
          <Text style={styles.proofHint}>
            {proofUploadMessage}
          </Text>
          {proofPhotoUri ? (
            <View style={styles.proofPreviewContainer}>
              <Image source={{ uri: proofPhotoUri }} style={styles.proofPreview} />
              <TouchableOpacity
                style={styles.proofRetakeButton}
                onPress={handleTakePhoto}
                disabled={pickingPhoto}
              >
                <Text style={styles.proofRetakeText}>Retake</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <AppButton
              title={pickingPhoto ? "Opening camera..." : "Take proof photo"}
              onPress={handleTakePhoto}
              variant="ghost"
              disabled={pickingPhoto}
              style={styles.proofButton}
            />
          )}
        </View>

        <AppButton
          title={savingDelivery ? "Confirming..." : "Confirm Delivery"}
          onPress={handleOpenConfirmDelivery}
          disabled={!proofPhotoUri || savingDelivery}
          style={{ marginTop: theme.spacing.md }}
          testID="confirm-delivery-open-confirm"
        />
        <AppButton
          title="Cancel Delivery"
          onPress={() => setCancelModalVisible(true)}
          variant="secondary"
          style={{ marginTop: theme.spacing.md }}
          testID="confirm-delivery-open-cancel"
        />
        <AppButton
          title="Report Concern"
          onPress={() => setReportModalVisible(true)}
          variant="secondary"
          style={{
            marginTop: theme.spacing.md,
            borderColor: "#ffffff",
            backgroundColor: "#888888",
          }}
          textStyle={{ color: "#ffffff" }}
        />
        <TouchableOpacity
          testID="confirm-delivery-back-dashboard"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push("/volunteer-dashboard")}
        >
          <Text style={styles.backText}>Back to dashboard</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>
              Are you sure you want to confirm this delivery?
            </Text>
            <View style={styles.modalButtons}>
              <AppButton
                title={savingDelivery ? "Saving..." : "Yes"}
                onPress={handleConfirmDelivery}
                disabled={savingDelivery}
                style={{ marginRight: theme.spacing.sm }}
                testID="confirm-delivery-confirm-yes"
              />
              <AppButton
                title="No"
                variant="secondary"
                onPress={() => setModalVisible(false)}
                testID="confirm-delivery-confirm-no"
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>
              Are you sure you want to cancel this delivery?
            </Text>
            <View style={styles.modalButtons}>
              <AppButton
                title="Yes"
                onPress={handleCancelDelivery}
                style={{ marginRight: theme.spacing.sm }}
                testID="confirm-delivery-cancel-yes"
              />
              <AppButton
                title="No"
                variant="secondary"
                onPress={() => setCancelModalVisible(false)}
                testID="confirm-delivery-cancel-no"
              />
            </View>
          </View>
        </View>
      </Modal>

      <ReportConcernModal
        visible={reportModalVisible}
        onClose={() => setReportModalVisible(false)}
        orderId={orderDetails.order_id}
        reportedId={orderDetails.customer_uid}
        reporterRole="volunteer"
        reportedRole="requester"
        subjectLabel="requester"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    borderWidth: 12,
    borderColor: "#398288",
    borderRadius: 55,
  },
  infoContainer: {
    padding: theme.spacing.lg,
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    marginTop: 50,
  },
  nameText: {
    fontSize: 28,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  dateText: {
    fontSize: 18,
    color: theme.colors.mutedText,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  addressText: {
    fontSize: 18,
    color: theme.colors.primary,
    textAlign: "center",
    textDecorationLine: "underline",
    marginBottom: theme.spacing.sm,
  },
  detailText: {
    fontSize: 20,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  backText: {
    fontSize: 16,
    color: theme.colors.secondary,
    textAlign: "center",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    borderRadius: 10,
    alignItems: "center",
  },
  modalText: {
    fontSize: 18,
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.md,
  },
  modalButtons: {
    flexDirection: "row",
  },
  proofSection: {
    marginTop: theme.spacing.lg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
  },
  proofLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  proofHint: {
    fontSize: 14,
    color: theme.colors.mutedText,
    textAlign: "center",
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  proofButton: {
    width: "100%",
  },
  proofPreviewContainer: {
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  proofPreview: {
    width: "100%",
    height: 180,
    borderRadius: theme.radius.md,
    resizeMode: "cover",
  },
  proofRetakeButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  proofRetakeText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
});
