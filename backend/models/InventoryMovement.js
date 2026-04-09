const mongoose = require('mongoose');

const inventoryMovementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    movementType: {
      type: String,
      enum: ['stock_in', 'stock_out', 'adjustment', 'expiry_removal'],
      required: true,
      index: true,
    },
    quantityDelta: {
      type: Number,
      required: true,
    },
    quantityBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    quantityAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      default: null,
      trim: true,
    },
    note: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    occurredAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

inventoryMovementSchema.index({ userId: 1, productId: 1, occurredAt: -1 });

module.exports = mongoose.model('InventoryMovement', inventoryMovementSchema);
