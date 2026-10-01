const RESTOCK_LEAD_DAYS = 7;
const MS_PER_DAY = 86400000;
const FAR_AWAY_DAYS = 365;

function parseDateValue(dateValue) {
    if (!dateValue) {
        return null;
    }

    let firstSlash = -1;
    let secondSlash = -1;

    for (let i = 0; i < dateValue.length; i++) {
        if (dateValue[i] === "/") {
            if (firstSlash === -1) {
                firstSlash = i;
            } else {
                secondSlash = i;
                break;
            }
        }
    }

    if (firstSlash === -1 || secondSlash === -1) {
        return null;
    }

    const month = Number(dateValue.substring(0, firstSlash));
    const day = Number(dateValue.substring(firstSlash + 1, secondSlash));
    const year = Number(dateValue.substring(secondSlash + 1, secondSlash + 5));

    if (isNaN(month) || isNaN(day) || isNaN(year)) {
        return null;
    }

    return new Date(year, month - 1, day);
}

function makeDateValue(date) {
    return (
        manualDatePart(date.getMonth() + 1) +
        "/" +
        manualDatePart(date.getDate()) +
        "/" +
        date.getFullYear()
    );
}

function addDaysToDateValue(dateValue, days) {
    const date = parseDateValue(dateValue);

    if (!date) {
        return "";
    }

    date.setDate(date.getDate() + days);

    return makeDateValue(date);
}

function getDaysBetween(fromValue, toValue) {
    const from = parseDateValue(fromValue);
    const to = parseDateValue(toValue);

    if (!from || !to) {
        return 0;
    }

    let difference = to.getTime() - from.getTime();
    const negative = difference < 0;

    if (negative) {
        difference = 0 - difference;
    }

    difference = difference + (MS_PER_DAY / 2);
    const days = (difference - (difference % MS_PER_DAY)) / MS_PER_DAY;

    return negative ? 0 - days : days;
}

function formatFriendlyDate(dateValue) {
    const date = parseDateValue(dateValue);

    if (!date) {
        return "";
    }

    return (
        MONTH_NAMES[date.getMonth()] +
        " " +
        date.getDate() +
        ", " +
        date.getFullYear()
    );
}

function describeDaysFromToday(dateValue) {
    const days = getDaysBetween(getDateOnly(), dateValue);

    if (days === 0) {
        return "today";
    }

    if (days === 1) {
        return "tomorrow";
    }

    if (days === -1) {
        return "yesterday";
    }

    if (days > 0) {
        return "in " + days + " days";
    }

    return (0 - days) + " days ago";
}

// Rounds a positive number up to a whole number without Math.ceil.
function roundUpWhole(value) {
    const remainder = value % 1;

    if (remainder > 0) {
        return value - remainder + 1;
    }

    return value;
}

function createRestockTracking(quantity) {
    return {
        baseDate: getDateOnly(),
        baseQty: Number(quantity) || 0,
        triggeredOn: ""
    };
}

function cloneRestockTracking(tracking, quantity) {
    if (!tracking || !tracking.baseDate) {
        return createRestockTracking(quantity);
    }

    return {
        baseDate: tracking.baseDate,
        baseQty: Number(tracking.baseQty) || 0,
        triggeredOn: tracking.triggeredOn || ""
    };
}

// Call when stock is increased. Starts a fresh usage baseline.
function recordVariantRestock(variant, newQuantity) {
    const today = getDateOnly();

    if (!variant.restockTracking) {
        variant.restockTracking = createRestockTracking(newQuantity);
    }

    const threshold =
        variant.threshold !== undefined
            ? Number(variant.threshold)
            : DEFAULT_THRESHOLD;

    variant.lastRestocked = today;
    variant.restockTracking.baseDate = today;
    variant.restockTracking.baseQty = newQuantity;

    // still at/below threshold after this delivery: a new order starts now
    variant.restockTracking.triggeredOn =
        newQuantity <= threshold ? today : "";
}

/*
   Works out the "possible next restock" for one variant.
   - At/below threshold: supplier delivery is expected
     RESTOCK_LEAD_DAYS after the day the restock was triggered.
   - Healthy stock: projects the day stock will reach the threshold from
     the average daily usage since the last restock, then adds the lead time.
   - No usage yet: no date is guessed.
*/
function refreshRestockDates(variant) {
    const quantity = Number(variant.quantity) || 0;

    const threshold =
        variant.threshold !== undefined
            ? Number(variant.threshold)
            : DEFAULT_THRESHOLD;

    if (!variant.restockTracking) {
        variant.restockTracking = createRestockTracking(quantity);
    }

    const tracking = variant.restockTracking;
    const today = getDateOnly();

    variant.nextRestock = "";
    variant.nextRestockType = "unknown";
    variant.nextRestockNote = "";

    if (quantity <= threshold) {
        if (!tracking.triggeredOn) {
            tracking.triggeredOn = today;
        }

        variant.nextRestock =
            addDaysToDateValue(tracking.triggeredOn, RESTOCK_LEAD_DAYS);

        variant.nextRestockType = "expected";

        const wait = getDaysBetween(today, variant.nextRestock);

        if (wait < 0) {
            variant.nextRestockNote =
                "Overdue by " + (0 - wait) +
                (wait === -1 ? " day" : " days") +
                " (ordered " + formatFriendlyDate(tracking.triggeredOn) + ")";
        } else {
            variant.nextRestockNote =
                "Delivery expected " + describeDaysFromToday(variant.nextRestock) +
                " (ordered " + formatFriendlyDate(tracking.triggeredOn) + ")";
        }

        return;
    }

    tracking.triggeredOn = "";

    const elapsed = getDaysBetween(tracking.baseDate, today);
    const used = tracking.baseQty - quantity;

    if (elapsed < 1 || used < 1) {
        variant.nextRestockNote = "Not enough usage yet to estimate";
        return;
    }

    const perDay = used / elapsed;
    const daysToThreshold = roundUpWhole((quantity - threshold) / perDay);

    if (daysToThreshold > FAR_AWAY_DAYS) {
        variant.nextRestockType = "far";
        variant.nextRestockNote = "Usage is very slow, no restock needed soon";
        return;
    }

    variant.nextRestock =
        addDaysToDateValue(today, daysToThreshold + RESTOCK_LEAD_DAYS);

    variant.nextRestockType = "projected";

    // one decimal place, no toFixed
    const tenths = (perDay * 10) + 0.5;
    const rounded = (tenths - (tenths % 1)) / 10;

    variant.nextRestockNote =
        "Projected from usage of about " + rounded + " per day";
}

// Copies the display fields of a variant onto its restock record.
function copyRestockDatesToRecord(record, variant) {
    record.lastRestocked = variant.lastRestocked || "";
    record.nextRestock = variant.nextRestock || "";
    record.nextRestockType = variant.nextRestockType || "unknown";
    record.nextRestockNote = variant.nextRestockNote || "";
    record.stockedSince =
        variant.restockTracking
            ? variant.restockTracking.baseDate
            : "";
}

function getProductVariantValues(
    product
) {
    let sizes =
        product.sizes || [];

    let colors =
        product.colors || [];

    let scents =
        product.scents || [];

    if (
        sizes.length === 0 &&
        colors.length === 0 &&
        scents.length === 0
    ) {
        return [
            {
                size: "",
                color: "",
                scent: ""
            }
        ];
    }

    const variants = [];

    if (
        sizes.length > 0 &&
        colors.length > 0
    ) {
        for (
            let i = 0;
            i < sizes.length;
            i++
        ) {
            for (
                let j = 0;
                j < colors.length;
                j++
            ) {
                addToArray(
                    variants,
                    {
                        size:
                            sizes[i],
                        color:
                            colors[j],
                        scent: ""
                    }
                );
            }
        }

        return variants;
    }

    if (sizes.length > 0) {
        for (
            let i = 0;
            i < sizes.length;
            i++
        ) {
            addToArray(
                variants,
                {
                    size:
                        sizes[i],
                    color: "",
                    scent: ""
                }
            );
        }

        return variants;
    }

    if (colors.length > 0) {
        for (
            let i = 0;
            i < colors.length;
            i++
        ) {
            addToArray(
                variants,
                {
                    size: "",
                    color:
                        colors[i],
                    scent: ""
                }
            );
        }

        return variants;
    }

    for (
        let i = 0;
        i < scents.length;
        i++
    ) {
        addToArray(
            variants,
            {
                size: "",
                color: "",
                scent:
                    scents[i]
            }
        );
    }

    return variants;
}

function getVariantList(
    product
) {
    return getProductVariantValues(
        product
    );
}

function getVariantKey(
    variant
) {
    return (
        (variant.color || "") +
        "|" +
        (variant.size || "") +
        "|" +
        (variant.scent || "")
    );
}

function getInitialVariantStock(productIndex) {
    return 0;
}

function findInventoryByProductId(productCode) {
    const wanted = convertToLowerCase(manualTrim(productCode));
    for (let i = 0; i < inventory.length; i++) {
        if (convertToLowerCase(manualTrim(inventory[i].productCode)) === wanted) {
            return inventory[i];
        }
    }
    return null;
}

function findVariantByKey(
    variants,
    key
) {
    for (
        let i = 0;
        i < variants.length;
        i++
    ) {
        if (
            variants[i].key === key
        ) {
            return variants[i];
        }
    }

    return null;
}

function createInventoryRecord(
    product,
    productIndex
) {
    if (findInventoryByProductId(product.code)) {
        return;
    }

    const variants =
        getVariantList(product);

    const inventoryVariants = [];

    for (
        let i = 0;
        i < variants.length;
        i++
    ) {
        addToArray(
            inventoryVariants,
            {
                id:
                    product.code +
                    "-V" +
                    (i + 1),

                key:
                    getVariantKey(
                        variants[i]
                    ),

                color:
                    variants[i].color ||
                    "",

                size:
                    variants[i].size ||
                    "",

                scent:
                    variants[i].scent ||
                    "",

                quantity:
                    getInitialVariantStock(
                        productIndex + i
                    ),

                threshold:
                    DEFAULT_THRESHOLD,

                lastRestocked:
                    "",

                nextRestock:
                    "",

                nextRestockType:
                    "unknown",

                nextRestockNote:
                    "",

                restockTracking:
                    createRestockTracking(
                        getInitialVariantStock(
                            productIndex + i
                        )
                    )
            }
        );
    }

    addToArray(
        inventory,
        {
            id:
                Date.now() +
                Math.random(),

            productId:
                product.code,

            productCode:
                product.code,

            name:
                product.name,

            category:
                product.category,

            image:
                product.image,

            variants:
                inventoryVariants
        }
    );
}

function updateInventoryProduct(
    product,
    oldCode
) {
    const item =
        findInventoryByProductId(
            oldCode === undefined ? product.code : oldCode
        );

    if (!item) {
        const productIndex =
            getProductIndex(
                product.id
            );

        createInventoryRecord(
            product,
            productIndex < 0
                ? 0
                : productIndex
        );

        return;
    }

    const oldVariants =
        item.variants || [];

    const newVariants =
        getVariantList(product);

    const updatedVariants = [];

    for (
        let i = 0;
        i < newVariants.length;
        i++
    ) {
        const newVariant =
            newVariants[i];

        const key =
            getVariantKey(
                newVariant
            );

        const oldVariant =
            findVariantByKey(
                oldVariants,
                key
            );

        let quantity =
            getInitialVariantStock(
                i
            );

        let threshold =
            DEFAULT_THRESHOLD;

        let lastRestocked = "";
        let nextRestock = "";
        let restockTracking = null;

        if (oldVariant) {
            quantity =
                Number(
                    oldVariant.quantity
                ) || 0;

            threshold =
                oldVariant.threshold !==
                undefined
                    ? Number(
                        oldVariant.threshold
                    )
                    : DEFAULT_THRESHOLD;

            lastRestocked =
                oldVariant.lastRestocked ||
                "";

            nextRestock =
                oldVariant.nextRestock ||
                "";

            restockTracking =
                oldVariant.restockTracking ||
                null;
        }

        addToArray(
            updatedVariants,
            {
                id:
                    product.code +
                    "-V" +
                    (i + 1),

                key:
                    key,

                color:
                    newVariant.color ||
                    "",

                size:
                    newVariant.size ||
                    "",

                scent:
                    newVariant.scent ||
                    "",

                quantity:
                    quantity,

                threshold:
                    threshold,

                lastRestocked:
                    lastRestocked,

                nextRestock:
                    nextRestock,

                restockTracking:
                    cloneRestockTracking(
                        restockTracking,
                        quantity
                    )
            }
        );
    }

    for (let i = 0; i < restockRecords.length; i++) {
        if (restockRecords[i].productId === item.productId) {
            restockRecords[i].productId = product.code;
            restockRecords[i].productCode = product.code;
            restockRecords[i].productName = product.name;
        }
    }
    item.productId = product.code;

    item.productCode =
        product.code;

    item.name =
        product.name;

    item.category =
        product.category;

    item.image =
        product.image;

    item.variants =
        updatedVariants;
}

function getInventoryRecord(
    productId
) {
    return findInventoryByProductId(
        productId
    );
}

function getTotalStock(
    item
) {
    let total = 0;

    const variants =
        item.variants || [];

    for (
        let i = 0;
        i < variants.length;
        i++
    ) {
        total +=
            Number(
                variants[i].quantity
            ) || 0;
    }

    return total;
}

function getVariantLabel(
    variant
) {
    let label = "";

    if (variant.color) {
        label +=
            variant.color;
    }

    if (variant.size) {
        if (label !== "") {
            label += " / ";
        }

        label +=
            "Size " +
            variant.size;
    }

    if (variant.scent) {
        if (label !== "") {
            label += " / ";
        }

        label +=
            variant.scent;
    }

    if (label === "") {
        return "Standard";
    }

    return label;
}

function removeInventoryRecord(
    productId
) {
    for (
        let i = inventory.length - 1;
        i >= 0;
        i--
    ) {
        if (
            String(
                inventory[i].productId
            ) ===
            String(productId)
        ) {
            removeFromArray(
                inventory,
                i
            );
        }
    }

    for (
        let i =
            restockRecords.length - 1;
        i >= 0;
        i--
    ) {
        if (
            String(
                restockRecords[i].productId
            ) ===
            String(productId)
        ) {
            removeFromArray(
                restockRecords,
                i
            );
        }
    }
}

function cloneInventoryVariants(
    variants
) {
    const result = [];

    variants =
        variants || [];

    for (
        let i = 0;
        i < variants.length;
        i++
    ) {
        addToArray(
            result,
            {
                id:
                    variants[i].id,

                key:
                    variants[i].key,

                color:
                    variants[i].color,

                size:
                    variants[i].size,

                scent:
                    variants[i].scent,

                quantity:
                    Number(
                        variants[i].quantity
                    ),

                threshold:
                    variants[i].threshold !==
                    undefined
                        ? Number(
                            variants[i].threshold
                        )
                        : DEFAULT_THRESHOLD,

                lastRestocked:
                    variants[i]
                        .lastRestocked ||
                    "",

                nextRestock:
                    variants[i]
                        .nextRestock ||
                    "",

                restockTracking:
                    cloneRestockTracking(
                        variants[i]
                            .restockTracking,
                        variants[i].quantity
                    )
            }
        );
    }

    return result;
}

function getLowStockVariants(
    item
) {
    const variants =
        item.variants || [];

    const lowVariants = [];

    for (
        let i = 0;
        i < variants.length;
        i++
    ) {
        const quantity =
            Number(
                variants[i].quantity
            ) || 0;

        const threshold =
            variants[i].threshold !==
            undefined
                ? Number(
                    variants[i].threshold
                )
                : DEFAULT_THRESHOLD;

        if (
            quantity <= threshold
        ) {
            addToArray(
                lowVariants,
                variants[i]
            );
        }
    }

    return lowVariants;
}

function getStatus(
    item
) {
    const variants =
        item.variants || [];

    if (
        variants.length === 0
    ) {
        return "out";
    }

    let allOut = true;
    let hasLow = false;

    for (
        let i = 0;
        i < variants.length;
        i++
    ) {
        const quantity =
            Number(
                variants[i].quantity
            ) || 0;

        const threshold =
            variants[i].threshold !==
            undefined
                ? Number(
                    variants[i].threshold
                )
                : DEFAULT_THRESHOLD;

        if (
            quantity > 0
        ) {
            allOut = false;
        }

        if (
            quantity > 0 &&
            quantity <= threshold
        ) {
            hasLow = true;
        }

        if (
            quantity === 0
        ) {
            hasLow = true;
        }
    }

    if (allOut) {
        return "out";
    }

    if (hasLow) {
        return "low";
    }

    return "available";
}

function getStatusText(
    status
) {
    if (
        status === "out"
    ) {
        return "Out of Stock";
    }

    if (
        status === "low"
    ) {
        return "Low Stock";
    }

    return "In Stock";
}

function updateSummary() {
    const total =
        inventory.length;

    let available = 0;
    let low = 0;
    let out = 0;

    for (
        let i = 0;
        i < inventory.length;
        i++
    ) {
        const status =
            getStatus(
                inventory[i]
            );

        if (
            status ===
            "available"
        ) {
            available++;
        } else if (
            status === "low"
        ) {
            low++;
        } else {
            out++;
        }
    }

    const totalProducts =
        document.getElementById(
            "totalProducts"
        );

    const inStock =
        document.getElementById(
            "inStock"
        );

    const lowStock =
        document.getElementById(
            "lowStock"
        );

    const outOfStock =
        document.getElementById(
            "outOfStock"
        );

    const inventoryCount =
        document.getElementById(
            "inventoryCount"
        );

    if (totalProducts) {
        totalProducts.textContent =
            total;
    }

    if (inStock) {
        inStock.textContent =
            available;
    }

    if (lowStock) {
        lowStock.textContent =
            low;
    }

    if (outOfStock) {
        outOfStock.textContent =
            out;
    }

    if (inventoryCount) {
        inventoryCount.textContent =
            total +
            (
                total === 1
                    ? " item"
                    : " items"
            );
    }
}

function findRestockRecord(
    productId,
    variantKey
) {
    for (
        let i = 0;
        i < restockRecords.length;
        i++
    ) {
        if (
            restockRecords[i]
                .productId ===
                productId &&
            restockRecords[i]
                .variantKey ===
                variantKey
        ) {
            return restockRecords[i];
        }
    }

    return null;
}

function createAutomaticRestock(
    item,
    variant
) {
    const variantKey =
        variant.key ||
        getVariantKey(
            variant
        );

    const existing =
        findRestockRecord(
            item.productId,
            variantKey
        );

    const currentQuantity =
        Number(
            variant.quantity
        ) || 0;

    const threshold =
        variant.threshold !==
        undefined
            ? Number(
                variant.threshold
            )
            : DEFAULT_THRESHOLD;

    let quantityToAdd =
        (threshold * 2) -
        currentQuantity;

    if (
        quantityToAdd < 1
    ) {
        quantityToAdd = 1;
    }

    if (existing) {
        existing.currentQuantity =
            currentQuantity;

        existing.threshold =
            threshold;

        existing.quantity =
            quantityToAdd;

        copyRestockDatesToRecord(
            existing,
            variant
        );

        if (
            currentQuantity <=
            threshold
        ) {
            // dropped below the threshold again after a restock: new trigger
            if (
                existing.status ===
                "Restocked"
            ) {
                existing.date =
                    getDateTime();
            }

            existing.status =
                "Automatic Restock";
        } else {
            existing.status =
                "Restocked";
        }

        return;
    }

    addToFront(
        restockRecords,
        {
            id:
                Date.now() +
                Math.random(),

            productId:
                item.productId,

            productCode:
                item.productCode,

            productName:
                item.name,

            variantKey:
                variantKey,

            variantLabel:
                getVariantLabel(
                    variant
                ),

            currentQuantity:
                currentQuantity,

            threshold:
                threshold,

            quantity:
                quantityToAdd,

            date:
                getDateTime(),

            lastRestocked:
                variant.lastRestocked ||
                "",

            nextRestock:
                variant.nextRestock ||
                "",

            nextRestockType:
                variant.nextRestockType ||
                "unknown",

            nextRestockNote:
                variant.nextRestockNote ||
                "",

            stockedSince:
                variant.restockTracking
                    ? variant.restockTracking.baseDate
                    : "",

            status:
                "Automatic Restock"
        }
    );
}

function activeKeyExists(
    activeKeys,
    key
) {
    for (
        let i = 0;
        i < activeKeys.length;
        i++
    ) {
        if (
            activeKeys[i] ===
            key
        ) {
            return true;
        }
    }

    return false;
}

function checkAutomaticRestock() {
    const activeKeys = [];

    for (
        let i = 0;
        i < inventory.length;
        i++
    ) {
        const item =
            inventory[i];

        const variants =
            item.variants || [];

        for (
            let j = 0;
            j < variants.length;
            j++
        ) {
            const variant =
                variants[j];

            refreshRestockDates(
                variant
            );

            const quantity =
                Number(
                    variant.quantity
                ) || 0;

            const threshold =
                variant.threshold !==
                undefined
                    ? Number(
                        variant.threshold
                    )
                    : DEFAULT_THRESHOLD;

            const variantKey =
                variant.key ||
                getVariantKey(
                    variant
                );

            const key =
                item.productId +
                "|" +
                variantKey;

            const existing =
                findRestockRecord(
                    item.productId,
                    variantKey
                );

            if (
                quantity <=
                threshold
            ) {
                addToArray(
                    activeKeys,
                    key
                );

                createAutomaticRestock(
                    item,
                    variant
                );
            } else if (
                existing
            ) {
                existing.currentQuantity =
                    quantity;

                existing.threshold =
                    threshold;

                existing.quantity =
                    0;

                copyRestockDatesToRecord(
                    existing,
                    variant
                );

                existing.status =
                    "Restocked";
            }
        }
    }

    for (
        let i =
            restockRecords.length - 1;
        i >= 0;
        i--
    ) {
        const record =
            restockRecords[i];

        let stillExists =
            false;

        for (
            let j = 0;
            j < inventory.length;
            j++
        ) {
            if (
                String(
                    inventory[j]
                        .productId
                ) ===
                String(
                    record.productId
                )
            ) {
                stillExists = true;
                break;
            }
        }

        if (!stillExists) {
            removeFromArray(
                restockRecords,
                i
            );
        }
    }
}

function renderInventory() {
    const inventoryBody =
        document.getElementById(
            "inventoryBody"
        );

    if (!inventoryBody) {
        return;
    }

    checkAutomaticRestock();

    const searchInput =
        document.getElementById(
            "inventorySearchInput"
        );

    const statusFilter =
        document.getElementById(
            "inventoryStatusFilter"
        );

    const search =
        searchInput
            ? convertToLowerCase(
                searchInput.value
            )
            : "";

    const selectedStatus =
        statusFilter
            ? statusFilter.value
            : "";

    inventoryBody.innerHTML = "";

    let filteredCount = 0;

    for (
        let i = 0;
        i < inventory.length;
        i++
    ) {
        const item =
            inventory[i];

        let variantSearch = "";

        const variants =
            item.variants || [];

        for (
            let j = 0;
            j < variants.length;
            j++
        ) {
            variantSearch +=
                getVariantLabel(
                    variants[j]
                ) +
                " ";
        }

        const matchesSearch =
            searchText(
                item.name,
                search
            ) ||
            searchText(
                item.productCode,
                search
            ) ||
            searchText(
                item.category,
                search
            ) ||
            searchText(
                variantSearch,
                search
            );

        const status =
            getStatus(item);

        const matchesStatus =
            selectedStatus === "" ||
            status === selectedStatus;

        if (
            !matchesSearch ||
            !matchesStatus
        ) {
            continue;
        }

        filteredCount++;

        const statusText =
            getStatusText(
                status
            );

        const totalStock =
            getTotalStock(item);

        const variantCount =
            variants.length;

        let variantPreview = "";

        let previewLimit =
            variantCount;

        if (
            previewLimit > 3
        ) {
            previewLimit = 3;
        }

        for (
            let j = 0;
            j < previewLimit;
            j++
        ) {
            if (j > 0) {
                variantPreview +=
                    ", ";
            }

            variantPreview +=
                getVariantLabel(
                    variants[j]
                );
        }

        let extraVariants = "";

        if (
            variantCount > 3
        ) {
            extraVariants =
                " + " +
                (
                    variantCount - 3
                ) +
                " more";
        }

        inventoryBody.innerHTML += `
            <tr>

                <td>

                    <div class="product-cell">

                        <div class="product-symbol">
                            ${escapeHTML(
                                getProductInitials(
                                    item.name
                                )
                            )}
                        </div>

                        <div>

                            <span class="product-name">
                                ${escapeHTML(
                                    item.name
                                )}
                            </span>

                            <span class="product-sub">
                                ${escapeHTML(
                                    item.category
                                )}
                            </span>

                        </div>

                    </div>

                </td>

                <td>

                    <span class="code">
                        ${escapeHTML(
                            item.productCode
                        )}
                    </span>

                </td>

                <td>

                    <div class="inventory-variant-summary">

                        <strong>
                            ${variantCount}
                            ${
                                variantCount === 1
                                    ? "variant"
                                    : "variants"
                            }
                        </strong>

                        <br>

                        ${escapeHTML(
                            variantPreview
                        )}

                        ${escapeHTML(
                            extraVariants
                        )}

                    </div>

                </td>

                <td>

                    <span class="quantity">
                        ${totalStock}
                    </span>

                </td>

                <td>

                    <span class="badge ${status}">
                        ${statusText}
                    </span>

                </td>

                <td>

                    <button
                        class="stock-btn"
                        onclick="openStockModal('${escapeHTML(
                            String(item.id)
                        )}')"
                    >
                        View Stock
                    </button>

                </td>

            </tr>
        `;
    }

    if (
        filteredCount === 0
    ) {
        inventoryBody.innerHTML = `
            <tr class="empty-row">

                <td colspan="6">

                    <div class="empty-state">

                        <div class="empty-icon">
                            ▦
                        </div>

                        <strong>
                            No inventory items found
                        </strong>

                        <span>
                            Try another product name, code, variant, or status.
                        </span>

                    </div>

                </td>

            </tr>
        `;
    }

    updateSummary();
    renderRestocking();
}

// Groups restock records by product so each product gets one card.
// Products that still need restocking come first, and inside a product
// the variants that need restocking come before the ones already restocked.
function getRestockGroups() {
    const groups = [];

    for (let i = 0; i < restockRecords.length; i++) {
        const record = restockRecords[i];
        if (
            record.productCode !== "LL-003" &&
            record.productCode !== "LL-004" &&
            record.productCode !== "LL-005"
        ) {
            continue;
        }
        let group = null;

        for (let j = 0; j < groups.length; j++) {
            if (String(groups[j].productId) === String(record.productId)) {
                group = groups[j];
                break;
            }
        }

        if (!group) {
            group = {
                productId: record.productId,
                productName: record.productName,
                productCode: record.productCode,
                triggered: [],
                restocked: []
            };

            addToArray(groups, group);
        }

        if (record.status === "Restocked") {
            addToArray(group.restocked, record);
        } else {
            addToArray(group.triggered, record);
        }
    }

    const ordered = [];

    for (let i = 0; i < groups.length; i++) {
        if (groups[i].triggered.length > 0) {
            addToArray(ordered, groups[i]);
        }
    }

    for (let i = 0; i < groups.length; i++) {
        if (groups[i].triggered.length === 0) {
            addToArray(ordered, groups[i]);
        }
    }

    return ordered;
}

function buildRestockRow(record) {
    const isRestocked = record.status === "Restocked";
    const isOut = !isRestocked && record.currentQuantity === 0;

    let pillClass = "";
    let pillText = "Restock triggered";

    if (isRestocked) {
        pillClass = "done";
        pillText = "Restocked";
    } else if (isOut) {
        pillClass = "out";
        pillText = "Out of stock";
    }

    // the meter is full at twice the threshold, so the tick sits at the threshold
    let maxValue = record.threshold * 2;

    if (maxValue < 1) {
        maxValue = 1;
    }

    let percent = (record.currentQuantity / maxValue) * 100;

    if (percent > 100) {
        percent = 100;
    }

    percent = percent - (percent % 1);

    let lastValue = "No restock yet";
    let lastNote = "";

    if (record.lastRestocked) {
        lastValue = formatFriendlyDate(record.lastRestocked);
        lastNote = firstLetterUpper(describeDaysFromToday(record.lastRestocked));
    } else if (record.stockedSince) {
        lastNote = "In stock since " + formatFriendlyDate(record.stockedSince);
    }

    let nextValue = "Not enough data";

    if (record.nextRestock) {
        nextValue = formatFriendlyDate(record.nextRestock);
    } else if (record.nextRestockType === "far") {
        nextValue = "Not needed soon";
    }

    const overdue =
        record.nextRestockType === "expected" &&
        record.nextRestock &&
        getDaysBetween(getDateOnly(), record.nextRestock) < 0;

    const nextLabel =
        record.nextRestockType === "expected"
            ? "Expected restock"
            : "Possible next restock";

    return `
        <div class="rs-row">

            <div class="rs-cell rs-variant">
                <strong>${escapeHTML(record.variantLabel)}</strong>
                <span class="rs-pill ${pillClass}">${pillText}</span>
            </div>

            <div class="rs-cell rs-stock" data-label="Stock">
                <strong>${record.currentQuantity}</strong>
                <span>min ${record.threshold}</span>
                <div class="rs-meter ${pillClass}">
                    <i style="width: ${percent}%"></i>
                </div>
            </div>

            <div class="rs-cell" data-label="To order">
                ${
                    isRestocked
                        ? `<span class="rs-muted">—</span>`
                        : `<span class="rs-add">+${record.quantity}</span>`
                }
            </div>

            <div class="rs-cell" data-label="Last restocked">
                <strong>${escapeHTML(lastValue)}</strong>
                ${lastNote ? `<small>${escapeHTML(lastNote)}</small>` : ""}
            </div>

            <div class="rs-cell rs-next ${overdue ? "overdue" : ""}" data-label="${nextLabel}">
                <strong>${escapeHTML(nextValue)}</strong>
                ${
                    record.nextRestockNote
                        ? `<small>${escapeHTML(record.nextRestockNote)}</small>`
                        : ""
                }
            </div>

        </div>
    `;
}

function buildRestockCard(group) {
    const totalVariants = group.triggered.length + group.restocked.length;
    const needCount = group.triggered.length;

    let hasOut = false;
    let totalToOrder = 0;
    let latestTrigger = "";

    for (let i = 0; i < group.triggered.length; i++) {
        const record = group.triggered[i];

        if (record.currentQuantity === 0) {
            hasOut = true;
        }

        totalToOrder += record.quantity;

        const triggerDate = record.date ? record.date.substring(0, 10) : "";

        if (
            triggerDate &&
            (!latestTrigger || getDaysBetween(latestTrigger, triggerDate) > 0)
        ) {
            latestTrigger = triggerDate;
        }
    }

    let badgeClass = "";
    let badgeText = needCount + " of " + totalVariants + " need restocking";

    if (needCount === 0) {
        badgeClass = "done";
        badgeText = "All restocked";
    } else if (hasOut) {
        badgeClass = "out";
    }

    let rows = "";

    for (let i = 0; i < group.triggered.length; i++) {
        rows += buildRestockRow(group.triggered[i]);
    }

    for (let i = 0; i < group.restocked.length; i++) {
        rows += buildRestockRow(group.restocked[i]);
    }

    let footer = "";

    if (needCount > 0) {
        footer = `
            <div class="rs-card-footer">
                <div class="rs-footer-left">
                    <i>✓</i>
                    <span><strong>Supplier automatically notified</strong></span>
                </div>
                <div class="rs-footer-right">
                    Total to order <strong>${totalToOrder} units</strong>
                    ${
                        latestTrigger
                            ? ` • Triggered <strong>${escapeHTML(formatFriendlyDate(latestTrigger))}</strong>`
                            : ""
                    }
                </div>
            </div>
        `;
    } else {
        footer = `
            <div class="rs-card-footer">
                <div class="rs-footer-left">
                    <i>✓</i>
                    <span><strong>All variants are back above their threshold</strong></span>
                </div>
            </div>
        `;
    }

    return `
        <div class="rs-card ${needCount === 0 ? "all-done" : ""}">

            <div class="rs-card-header">

                <div class="rs-product">
                    <div class="rs-product-icon">
                        ${escapeHTML(getProductInitials(group.productName))}
                    </div>
                    <div>
                        <h3>${escapeHTML(group.productName)}</h3>
                        <span>
                            ${escapeHTML(group.productCode)} •
                            ${totalVariants} ${totalVariants === 1 ? "variant" : "variants"}
                        </span>
                    </div>
                </div>

                <div class="rs-badge ${badgeClass}">${badgeText}</div>

            </div>

            <div class="rs-table">

                <div class="rs-row rs-head">
                    <div>Variant</div>
                    <div>Stock</div>
                    <div>To order</div>
                    <div>Last restocked</div>
                    <div>Next restock</div>
                </div>

                ${rows}

            </div>

            ${footer}

        </div>
    `;
}

function renderRestocking() {
    const restockList =
        document.getElementById("restockList");

    if (!restockList) {
        return;
    }

    checkAutomaticRestock();

    const groups = getRestockGroups();

    if (groups.length === 0) {
        restockList.innerHTML = `
            <div class="restock-empty" id="restockEmpty">
                <div class="empty-icon">↻</div>
                <strong>No restocking activity</strong>
                <span>
                    Automatic restocking records will appear here when an item reaches its threshold.
                </span>
            </div>
        `;

        return;
    }

    let cards = "";

    for (let i = 0; i < groups.length; i++) {
        cards += buildRestockCard(groups[i]);
    }

    restockList.innerHTML = cards;
}

function openStockModal(
    id
) {
    let item = null;

    for (
        let i = 0;
        i < inventory.length;
        i++
    ) {
        if (
            String(
                inventory[i].id
            ) ===
            String(id)
        ) {
            item =
                inventory[i];

            break;
        }
    }

    if (!item) {
        return;
    }

    const stockModal =
        document.getElementById(
            "stockModal"
        );

    const stockItemId =
        document.getElementById(
            "stockItemId"
        );

    const stockProductName =
        document.getElementById(
            "stockProductName"
        );

    const stockProductCode =
        document.getElementById(
            "stockProductCode"
        );

    const stockProductIcon =
        document.getElementById(
            "stockProductIcon"
        );

    const stockMessage =
        document.getElementById(
            "stockMessage"
        );

    if (stockItemId) {
        stockItemId.value =
            item.id;
    }

    if (stockProductName) {
        stockProductName.textContent =
            item.name;
    }

    if (stockProductCode) {
        stockProductCode.textContent =
            item.productCode;
    }

    if (stockProductIcon) {
        stockProductIcon.textContent =
            getProductInitials(
                item.name
            );
    }

    if (stockMessage) {
        stockMessage.textContent =
            "";

        stockMessage.classList.remove(
            "stock-save-success"
        );
    }

    let variantContainer =
        document.getElementById(
            "variantStockContainer"
        );

    if (!variantContainer) {
        variantContainer =
            document.createElement(
                "div"
            );

        variantContainer.id =
            "variantStockContainer";

        const stockForm =
            document.getElementById(
                "stockForm"
            );

        if (stockForm) {
            stockForm.insertBefore(
                variantContainer,
                stockForm.querySelector(
                    ".modal-actions"
                )
            );
        }
    }

    const variants =
        item.variants || [];

    let variantHTML = `
        <div class="variant-stock-title">
            Stock by Variant
        </div>

        <div class="variant-stock-info">
            Each color, size, or scent is tracked separately.
            Automatic restocking is triggered when a variant
            reaches its threshold.
        </div>

        <div class="variant-stock-list">
    `;

    for (
        let i = 0;
        i < variants.length;
        i++
    ) {
        const variant =
            variants[i];

        const quantity =
            Number(
                variant.quantity
            ) || 0;

        const threshold =
            variant.threshold !==
            undefined
                ? Number(
                    variant.threshold
                )
                : DEFAULT_THRESHOLD;

        let statusClass =
            "available";

        let statusText =
            "In Stock";

        if (
            quantity === 0
        ) {
            statusClass =
                "out";

            statusText =
                "Out of Stock";

        } else if (
            quantity <=
            threshold
        ) {
            statusClass =
                "low";

            statusText =
                "Low Stock";
        }

        variantHTML += `
            <div class="variant-stock-row">

                <div class="variant-stock-name">

                    <strong>
                        ${escapeHTML(
                            getVariantLabel(
                                variant
                            )
                        )}
                    </strong>

                    <span class="variant-stock-status ${statusClass}">
                        ${statusText}
                    </span>

                </div>

                <div class="stock-input-group">

                    <label>
                        Stock
                    </label>

                    <input
                        type="number"
                        min="0"
                        value="${quantity}"
                        data-variant-index="${i}"
                        class="variant-stock-input"
                    >

                </div>

                <div class="stock-input-group">

                    <label>
                        Threshold
                    </label>

                    <input
                        type="number"
                        min="0"
                        value="${threshold}"
                        data-variant-index="${i}"
                        class="variant-threshold-input"
                    >

                </div>

            </div>
        `;
    }

    variantHTML += `
        </div>
    `;

    variantContainer.innerHTML =
        variantHTML;

    if (stockModal) {
        stockModal.classList.add(
            "show"
        );
    }
}

function closeStockModal() {
    const modal =
        document.getElementById(
            "stockModal"
        );

    if (modal) {
        modal.classList.remove(
            "show"
        );
    }
}

const stockForm =
    document.getElementById(
        "stockForm"
    );

if (stockForm) {
    stockForm.addEventListener(
        "submit",
        function(event) {
            event.preventDefault();

            const id =
                document.getElementById(
                    "stockItemId"
                ).value;

            const message =
                document.getElementById(
                    "stockMessage"
                );

            let item = null;

            for (
                let i = 0;
                i < inventory.length;
                i++
            ) {
                if (
                    String(
                        inventory[i].id
                    ) ===
                    String(id)
                ) {
                    item =
                        inventory[i];

                    break;
                }
            }

            if (!item) {
                return;
            }

            const quantityInputs =
                document.querySelectorAll(
                    ".variant-stock-input"
                );

            const thresholdInputs =
                document.querySelectorAll(
                    ".variant-threshold-input"
                );

            for (
                let i = 0;
                i < quantityInputs.length;
                i++
            ) {
                const quantity =
                    Number(
                        quantityInputs[i].value
                    );

                if (
                    quantity !== quantity ||
                    quantity < 0
                ) {
                    message.textContent =
                        "Stock quantity cannot be negative.";

                    return;
                }
            }

            for (
                let i = 0;
                i < thresholdInputs.length;
                i++
            ) {
                const threshold =
                    Number(
                        thresholdInputs[i].value
                    );

                if (
                    threshold !== threshold ||
                    threshold < 0
                ) {
                    message.textContent =
                        "Threshold cannot be negative.";

                    return;
                }
            }

            let changedCount = 0;

            for (
                let i = 0;
                i < quantityInputs.length;
                i++
            ) {
                const variantIndex =
                    Number(
                        quantityInputs[i]
                            .dataset
                            .variantIndex
                    );

                const quantity =
                    Number(
                        quantityInputs[i].value
                    );

                const threshold =
                    Number(
                        thresholdInputs[i].value
                    );

                const variant =
                    item.variants[
                        variantIndex
                    ];

                const oldQuantity =
                    Number(
                        variant.quantity
                    ) || 0;

                const oldThreshold =
                    variant.threshold !==
                    undefined
                        ? Number(
                            variant.threshold
                        )
                        : DEFAULT_THRESHOLD;

                const quantityChanged =
                    oldQuantity !==
                    quantity;

                const thresholdChanged =
                    oldThreshold !==
                    threshold;

                const row =
                    quantityInputs[i]
                        .closest(
                            ".variant-stock-row"
                        );

                const oldNote =
                    row
                        ? row.querySelector(
                            ".stock-change-note"
                        )
                        : null;

                if (oldNote) {
                    oldNote.remove();
                }

                if (
                    quantityChanged ||
                    thresholdChanged
                ) {
                    changedCount++;

                    if (row) {
                        row.classList.add(
                            "stock-row-changed"
                        );

                        let changeHTML =
                            `<div class="stock-change-note">`;

                        if (
                            quantityChanged
                        ) {
                            changeHTML += `
                                <span>
                                    ✓ Stock updated:
                                    ${oldQuantity} → ${quantity}
                                </span>
                            `;
                        }

                        if (
                            thresholdChanged
                        ) {
                            changeHTML += `
                                <span>
                                    ✓ Threshold updated:
                                    ${oldThreshold} → ${threshold}
                                </span>
                            `;
                        }

                        changeHTML +=
                            `</div>`;

                        row.insertAdjacentHTML(
                            "beforeend",
                            changeHTML
                        );
                    }
                } else if (row) {
                    row.classList.remove(
                        "stock-row-changed"
                    );
                }

                variant.quantity =
                    quantity;

                variant.threshold =
                    threshold;

                if (
                    quantity >
                    oldQuantity
                ) {
                    recordVariantRestock(
                        variant,
                        quantity
                    );
                }
            }

            if (
                changedCount > 0
            ) {
                message.innerHTML =
                    "Stock changes saved successfully.";

                message.classList.add(
                    "stock-save-success"
                );
            } else {
                message.textContent =
                    "No stock changes were made.";

                message.classList.remove(
                    "stock-save-success"
                );
            }

            checkAutomaticRestock();
            renderInventory();
            renderRestocking();
        }
    );
}

const stockModal =
    document.getElementById(
        "stockModal"
    );

if (stockModal) {
    stockModal.addEventListener(
        "click",
        function(event) {
            if (
                event.target ===
                stockModal
            ) {
                closeStockModal();
            }
        }
    );
}

const inventorySearchInput =
    document.getElementById(
        "inventorySearchInput"
    );

if (inventorySearchInput) {
    inventorySearchInput.addEventListener(
        "input",
        renderInventory
    );
}

const inventoryStatusFilter =
    document.getElementById(
        "inventoryStatusFilter"
    );

if (inventoryStatusFilter) {
    inventoryStatusFilter.addEventListener(
        "change",
        renderInventory
    );
}

for (
    let i = 0;
    i < products.length;
    i++
) {
    if (
        products[i].code === "LL-003" ||
        products[i].code === "LL-004" ||
        products[i].code === "LL-005"
    ) {
        createInventoryRecord(
            products[i],
            i
        );
    }
}

renderInventory();