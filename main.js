const CONFIG = Object.freeze({
  gridSize: 30,
  tileSize: 24,
  seaRows: 9,
  maxSeaFish: 120,
  initialSeaFish: 90,
  seaFishRegenPerSecond: 0.65,
  lowSeaFishEfficiencyFloor: 0.25,
  fishCatchSeaCost: 3,
  fishPerCatch: 1,
  fishingWorkRequired: 2.4,
  fishingSpotFishMax: 20,
  fishingSpotWorkerSlots: 2,
  dryingRackWorkerSlots: 1,
  dryingRackFishInputMax: 8,
  dryingRackDriedFishOutputMax: 6,
  dryingRackFishPerBatch: 2,
  dryingRackDriedFishPerBatch: 1,
  dryingWorkRequired: 5.5,
  storageFishMax: 100,
  initialStorageFish: 8,
  initialStorageDriedFish: 0,
  sealCount: 5,
  sealMoveTilesPerSecond: 3.8,
  hungerPerSecond: 1.05,
  hungerEatThreshold: 52,
  hungerCriticalThreshold: 82,
  maxHunger: 100,
  hungerReducedPerFish: 38,
  hungerReducedPerDriedFish: 58,
  sealCarryCapacity: 5,
  maxDeltaSeconds: 0.1,
  assetSizeRatio: 0.78,
  facilitySizeTiles: 2.4,
  floatingTextDuration: 1.1,
  wanderPauseSeconds: 1.4,
  positions: Object.freeze({
    fishingSpot: Object.freeze({ x: 14, y: 8 }),
    storage: Object.freeze({ x: 18, y: 17 }),
    dryingRack: Object.freeze({ x: 13, y: 17 }),
    seals: Object.freeze([
      Object.freeze({ x: 16, y: 18 }),
      Object.freeze({ x: 17, y: 19 }),
      Object.freeze({ x: 18, y: 18 }),
      Object.freeze({ x: 19, y: 19 }),
      Object.freeze({ x: 20, y: 18 }),
    ]),
  }),
});

const TASKS = Object.freeze({
  idle: "Idle",
  fishing: "Fishing",
  waiting: "Waiting for space",
  haulPickup: "Hauling: pickup resource",
  haulDeposit: "Hauling: deposit resource",
  drying: "Drying fish",
  eating: "Eating",
  seekingFood: "Seeking food",
  wandering: "Wandering",
  starving: "Starving",
});

const FACILITY_TYPES = Object.freeze({
  fishingSpot: "fishingSpot",
  storage: "storage",
  dryingRack: "dryingRack",
});

const RESOURCES = Object.freeze({
  fish: "fish",
  driedFish: "driedFish",
});

const ASSETS = Object.freeze({
  seal: createImageAsset("Seal", "assets/seal.png", "#f7fbff", "#2e6071"),
  fishingSpot: createImageAsset("Fishing Spot", "assets/fishing-spot.png", "#73d7ff", "#004e70"),
  storage: createImageAsset("Storage", "assets/storage.png", "#c08a45", "#4d3218"),
  dryingRack: createImageAsset("Drying Rack", "assets/drying-rack.png", "#d6a15c", "#5f3515"),
  fish: createImageAsset("Fish", "assets/fish.png", "#7de1ff", "#005a7a"),
  driedFish: createImageAsset("Dried Fish", "assets/dried-fish.png", "#c9844a", "#4d2a17"),
});

const canvas = document.getElementById("gameCanvas");
const context = canvas.getContext("2d");
const ui = collectUi();
const gameState = createInitialGameState();

function collectUi() {
  return {
    startButton: document.getElementById("startButton"),
    selectToolButton: document.getElementById("selectToolButton"),
    seaFishValue: document.getElementById("seaFishValue"),
    storedFishValue: document.getElementById("storedFishValue"),
    storedDriedFishValue: document.getElementById("storedDriedFishValue"),
    sealCountValue: document.getElementById("sealCountValue"),
    phaseValue: document.getElementById("phaseValue"),
    inspectorContent: document.getElementById("inspectorContent"),
    totalSealsValue: document.getElementById("totalSealsValue"),
    idleValue: document.getElementById("idleValue"),
    fishingWorkersValue: document.getElementById("fishingWorkersValue"),
    haulersValue: document.getElementById("haulersValue"),
    wanderingValue: document.getElementById("wanderingValue"),
    messageValue: document.getElementById("messageValue"),
  };
}

function createImageAsset(name, src, primaryColor, secondaryColor) {
  const image = new Image();
  const asset = { name, src, image, loaded: false, failed: false, primaryColor, secondaryColor };
  image.onload = () => { asset.loaded = true; };
  image.onerror = () => { asset.failed = true; };
  image.src = src;
  return asset;
}

function createInitialGameState() {
  return {
    phase: "start",
    map: createMap(),
    resources: { seaFish: CONFIG.initialSeaFish },
    facilities: [
      createFishingSpot("facility-fishing-1", "North Shoal Fishing Spot", CONFIG.positions.fishingSpot),
      createDryingRack("facility-drying-1", "Sunward Drying Rack", CONFIG.positions.dryingRack),
      createStorage("facility-storage-1", "Beach Pantry", CONFIG.positions.storage),
    ],
    seals: CONFIG.positions.seals.map((position, index) => createSeal(index + 1, position)),
    selection: { type: "facility", id: "facility-fishing-1" },
    visualEffects: [],
    frameLists: { assignedWorkerIds: [], haulingSealIds: [], wanderingSealIds: [] },
    timing: { lastFrameTime: performance.now(), animationTime: 0 },
    message: "Start the colony to begin the simulation.",
  };
}

function createMap() {
  const tiles = [];
  for (let y = 0; y < CONFIG.gridSize; y += 1) {
    const row = [];
    for (let x = 0; x < CONFIG.gridSize; x += 1) {
      row.push(y < CONFIG.seaRows ? "sea" : "beach");
    }
    tiles.push(row);
  }
  return { width: CONFIG.gridSize, height: CONFIG.gridSize, tiles };
}

function createFishingSpot(id, name, position) {
  return {
    id,
    type: FACILITY_TYPES.fishingSpot,
    name,
    position: { ...position },
    workerSlots: CONFIG.fishingSpotWorkerSlots,
    priority: 3,
    inventory: { fish: 0, fishMax: CONFIG.fishingSpotFishMax },
  };
}

function createDryingRack(id, name, position) {
  return {
    id,
    type: FACILITY_TYPES.dryingRack,
    name,
    position: { ...position },
    workerSlots: CONFIG.dryingRackWorkerSlots,
    priority: 2,
    inventory: {
      inputs: { fish: 0, fishMax: CONFIG.dryingRackFishInputMax },
      outputs: { driedFish: 0, driedFishMax: CONFIG.dryingRackDriedFishOutputMax },
    },
    production: { progress: 0, workRequired: CONFIG.dryingWorkRequired },
  };
}

function createStorage(id, name, position) {
  return {
    id,
    type: FACILITY_TYPES.storage,
    name,
    position: { ...position },
    acceptedResources: { fish: true, driedFish: true, water: false },
    inventory: { fish: CONFIG.initialStorageFish, driedFish: CONFIG.initialStorageDriedFish, max: CONFIG.storageFishMax },
  };
}

function createSeal(id, position) {
  return {
    id,
    name: ["Nami", "Brisk", "Kelp", "Toto", "Mochi"][id - 1],
    position: { ...position },
    hunger: id * 4,
    carryingItem: null,
    carryingAmount: 0,
    assignedFacilityId: null,
    currentTask: TASKS.idle,
    targetPosition: null,
    statusText: "Waiting for orders",
    actionProgress: 0,
    wanderPause: 0,
    haulingPlan: null,
  };
}

function startGame() {
  if (gameState.phase !== "start") {
    resetGameState(gameState);
  }
  gameState.phase = "playing";
  gameState.message = "Colony running: workers fish, drying racks preserve food, hungry seals eat first.";
  gameState.timing.lastFrameTime = performance.now();
  ui.startButton.textContent = "Restart Colony";
}

function resetGameState(state) {
  const fresh = createInitialGameState();
  Object.keys(fresh).forEach((key) => { state[key] = fresh[key]; });
}

function gameLoop(timestamp) {
  const deltaSeconds = Math.min((timestamp - gameState.timing.lastFrameTime) / 1000, CONFIG.maxDeltaSeconds);
  gameState.timing.lastFrameTime = timestamp;
  gameState.timing.animationTime += deltaSeconds;
  update(gameState, deltaSeconds);
  render(gameState);
  requestAnimationFrame(gameLoop);
}

function update(state, deltaSeconds) {
  cleanDynamicArrays(state);
  if (state.phase !== "playing") {
    return;
  }
  regenerateSeaFish(state, deltaSeconds);
  increaseAllHunger(state, deltaSeconds);
  assignFacilityWorkers(state);
  updateSeals(state, deltaSeconds);
  updateVisualEffects(state, deltaSeconds);
  checkGameOver(state);
}

function cleanDynamicArrays(state) {
  state.frameLists.assignedWorkerIds.length = 0;
  state.frameLists.haulingSealIds.length = 0;
  state.frameLists.wanderingSealIds.length = 0;
}

function regenerateSeaFish(state, deltaSeconds) {
  state.resources.seaFish = clamp(state.resources.seaFish + CONFIG.seaFishRegenPerSecond * deltaSeconds, 0, CONFIG.maxSeaFish);
}

function increaseAllHunger(state, deltaSeconds) {
  state.seals.forEach((seal) => {
    seal.hunger = clamp(seal.hunger + CONFIG.hungerPerSecond * deltaSeconds, 0, CONFIG.maxHunger);
  });
}

function assignFacilityWorkers(state) {
  state.seals.forEach((seal) => {
    if (seal.assignedFacilityId && !seal.carryingItem && !canFacilityUseWorker(getFacilityById(state, seal.assignedFacilityId))) {
      seal.assignedFacilityId = null;
      seal.actionProgress = 0;
    }
  });

  getWorkerFacilitiesByPriority(state).forEach((facility) => {
    while (getAssignedWorkers(state, facility.id).length < facility.workerSlots && canFacilityUseWorker(facility)) {
      const seal = state.seals.find((candidate) => !candidate.assignedFacilityId && !isHungry(candidate) && !candidate.carryingItem);
      if (!seal) break;
      seal.assignedFacilityId = facility.id;
    }
  });
}

function canFacilityUseWorker(facility) {
  if (!facility) return false;
  if (facility.type === FACILITY_TYPES.fishingSpot) return facility.inventory.fish < facility.inventory.fishMax;
  if (facility.type === FACILITY_TYPES.dryingRack) return hasDryingRackOutputCapacity(facility);
  return false;
}

function getWorkerFacilitiesByPriority(state) {
  return state.facilities
    .filter((facility) => canFacilityUseWorker(facility))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function updateSeals(state, deltaSeconds) {
  state.seals.forEach((seal) => {
    if (handleEatingPriority(state, seal, deltaSeconds)) return;
    if (seal.assignedFacilityId) {
      updateAssignedWorker(state, seal, deltaSeconds);
      return;
    }
    updateHaulerOrWanderer(state, seal, deltaSeconds);
  });
}

function handleEatingPriority(state, seal, deltaSeconds) {
  if (!isHungry(seal)) return false;
  const storage = seal.carryingItem ? findStorageForEmergencyDeposit(state) : findStorageWithFood(state);
  seal.assignedFacilityId = null;
  seal.haulingPlan = null;
  if (!storage) {
    setSealTask(seal, TASKS.starving, null, "Hungry; no stored food available");
    return true;
  }
  setSealTask(seal, TASKS.seekingFood, storage.position, "Prioritizing food over work");
  if (moveSealTowardTarget(seal, deltaSeconds)) return true;
  if (seal.carryingItem) depositResourceToStorage(seal, storage, seal.carryingItem);
  const food = chooseBestStoredFood(storage);
  if (food) {
    removeStorageResource(storage, food.resource, 1);
    seal.hunger = clamp(seal.hunger - food.hungerRestored, 0, CONFIG.maxHunger);
    setSealTask(seal, TASKS.eating, storage.position, `Ate one ${food.label.toLowerCase()} from storage`);
    addFloatingTextEffect(state, food.resource === RESOURCES.driedFish ? "Tasty!" : "Nom", seal.position, "#fff1a8");
  }
  return true;
}

function updateAssignedWorker(state, seal, deltaSeconds) {
  const facility = getFacilityById(state, seal.assignedFacilityId);
  if (!facility) {
    seal.assignedFacilityId = null;
    return;
  }
  state.frameLists.assignedWorkerIds.push(seal.id);
  if (facility.type === FACILITY_TYPES.fishingSpot) updateFishingWorker(state, seal, facility, deltaSeconds);
  if (facility.type === FACILITY_TYPES.dryingRack) updateDryingRackWorker(state, seal, facility, deltaSeconds);
}

function updateFishingWorker(state, seal, facility, deltaSeconds) {
  setSealTask(seal, facility.inventory.fish >= facility.inventory.fishMax ? TASKS.waiting : TASKS.fishing, getWorkPositionForFacility(facility), `Assigned to ${facility.name}`);
  if (moveSealTowardTarget(seal, deltaSeconds)) return;
  if (facility.inventory.fish >= facility.inventory.fishMax) {
    seal.statusText = "Fishing spot inventory full";
    seal.actionProgress = 0;
    return;
  }
  if (state.resources.seaFish <= 0) {
    seal.statusText = "Waiting for sea fish";
    seal.actionProgress = 0;
    return;
  }
  seal.actionProgress += getFishingEfficiency(state) * deltaSeconds;
  if (seal.actionProgress >= CONFIG.fishingWorkRequired) {
    seal.actionProgress = 0;
    state.resources.seaFish = Math.max(0, state.resources.seaFish - CONFIG.fishCatchSeaCost);
    facility.inventory.fish = Math.min(facility.inventory.fishMax, facility.inventory.fish + CONFIG.fishPerCatch);
    addFloatingTextEffect(state, "+1 fish", facility.position, "#9bedff");
  }
}

function updateDryingRackWorker(state, seal, facility, deltaSeconds) {
  if (seal.carryingItem === RESOURCES.fish) {
    setSealTask(seal, TASKS.haulDeposit, facility.position, `Bringing fish to ${facility.name}`);
    if (moveSealTowardTarget(seal, deltaSeconds)) return;
    depositFishToDryingRack(seal, facility);
  }
  if (!hasDryingRackOutputCapacity(facility)) {
    setSealTask(seal, TASKS.waiting, getWorkPositionForFacility(facility), "Drying rack output full");
    seal.actionProgress = 0;
    facility.production.progress = 0;
    moveSealTowardTarget(seal, deltaSeconds);
    return;
  }
  if (!hasDryingRackBatchInput(facility)) {
    fetchDryingRackInput(state, seal, facility, deltaSeconds);
    return;
  }
  setSealTask(seal, TASKS.drying, getWorkPositionForFacility(facility), `Drying fish at ${facility.name}`);
  if (moveSealTowardTarget(seal, deltaSeconds)) return;
  seal.actionProgress += deltaSeconds;
  facility.production.progress = seal.actionProgress;
  if (seal.actionProgress >= facility.production.workRequired) {
    seal.actionProgress = 0;
    facility.production.progress = 0;
    facility.inventory.inputs.fish -= CONFIG.dryingRackFishPerBatch;
    facility.inventory.outputs.driedFish += CONFIG.dryingRackDriedFishPerBatch;
    addFloatingTextEffect(state, "+1 dried fish", facility.position, "#ffd166");
  }
}

function fetchDryingRackInput(state, seal, facility, deltaSeconds) {
  facility.production.progress = 0;
  seal.actionProgress = 0;
  const storage = findStorageWithResource(state, RESOURCES.fish);
  if (!storage) {
    setSealTask(seal, TASKS.waiting, getWorkPositionForFacility(facility), "Waiting for fish deliveries");
    moveSealTowardTarget(seal, deltaSeconds);
    return;
  }
  setSealTask(seal, TASKS.haulPickup, storage.position, `Fetching fish for ${facility.name}`);
  if (moveSealTowardTarget(seal, deltaSeconds)) return;
  const needed = facility.inventory.inputs.fishMax - facility.inventory.inputs.fish;
  const amount = Math.min(CONFIG.sealCarryCapacity, needed, storage.inventory.fish);
  if (amount <= 0) return;
  removeStorageResource(storage, RESOURCES.fish, amount);
  seal.carryingItem = RESOURCES.fish;
  seal.carryingAmount = amount;
}

function hasDryingRackBatchInput(facility) {
  return facility.inventory.inputs.fish >= CONFIG.dryingRackFishPerBatch;
}

function hasDryingRackInputCapacity(facility) {
  return facility.inventory.inputs.fish < facility.inventory.inputs.fishMax;
}

function hasDryingRackOutputCapacity(facility) {
  return facility.inventory.outputs.driedFish < facility.inventory.outputs.driedFishMax;
}

function updateHaulerOrWanderer(state, seal, deltaSeconds) {
  if (!seal.haulingPlan || !isHaulingPlanValid(state, seal.haulingPlan)) {
    seal.haulingPlan = findHaulingPlan(state);
  }
  if (seal.haulingPlan) {
    updateHaulingTask(state, seal, deltaSeconds);
    state.frameLists.haulingSealIds.push(seal.id);
    return;
  }
  updateWandering(state, seal, deltaSeconds);
  state.frameLists.wanderingSealIds.push(seal.id);
}

function findHaulingPlan(state) {
  return findRackOutputHaulingPlan(state)
    || findFishingSpotHaulingPlan(state)
    || findRackInputHaulingPlan(state);
}

function findRackOutputHaulingPlan(state) {
  const source = state.facilities.find((facility) => facility.type === FACILITY_TYPES.dryingRack && facility.inventory.outputs.driedFish > 0);
  const destination = state.facilities.find((facility) => isStorageAcceptingResourceWithCapacity(facility, RESOURCES.driedFish));
  return source && destination ? createHaulingPlan(source, destination, RESOURCES.driedFish, "output") : null;
}

function findFishingSpotHaulingPlan(state) {
  const source = state.facilities.find((facility) => facility.type === FACILITY_TYPES.fishingSpot && facility.inventory.fish > 0);
  const destination = state.facilities.find((facility) => isStorageAcceptingResourceWithCapacity(facility, RESOURCES.fish));
  return source && destination ? createHaulingPlan(source, destination, RESOURCES.fish, "inventory") : null;
}

function findRackInputHaulingPlan(state) {
  const destination = state.facilities.find((facility) => facility.type === FACILITY_TYPES.dryingRack && hasDryingRackInputCapacity(facility));
  const source = state.facilities.find((facility) => facility.type === FACILITY_TYPES.storage && facility.inventory.fish > 0);
  return source && destination ? createHaulingPlan(source, destination, RESOURCES.fish, "input") : null;
}

function createHaulingPlan(source, destination, resource, destinationInventory) {
  return { sourceFacilityId: source.id, destinationFacilityId: destination.id, resource, destinationInventory, stage: "pickup" };
}

function isHaulingPlanValid(state, plan) {
  const source = getFacilityById(state, plan.sourceFacilityId);
  const destination = getFacilityById(state, plan.destinationFacilityId);
  if (!source || !destination) return false;
  if (plan.stage === "deposit") return canDepositPlannedResource(destination, plan);
  return getHaulingSourceAmount(source, plan) > 0 && canDepositPlannedResource(destination, plan);
}

function canDepositPlannedResource(destination, plan) {
  if (destination.type === FACILITY_TYPES.storage) return isStorageAcceptingResourceWithCapacity(destination, plan.resource);
  if (destination.type === FACILITY_TYPES.dryingRack && plan.destinationInventory === "input") return hasDryingRackInputCapacity(destination);
  return false;
}

function getHaulingSourceAmount(source, plan) {
  if (source.type === FACILITY_TYPES.fishingSpot && plan.resource === RESOURCES.fish) return source.inventory.fish;
  if (source.type === FACILITY_TYPES.storage) return source.inventory[plan.resource] || 0;
  if (source.type === FACILITY_TYPES.dryingRack && plan.resource === RESOURCES.driedFish) return source.inventory.outputs.driedFish;
  return 0;
}

function updateHaulingTask(state, seal, deltaSeconds) {
  const source = getFacilityById(state, seal.haulingPlan.sourceFacilityId);
  const destination = getFacilityById(state, seal.haulingPlan.destinationFacilityId);
  const resourceName = getResourceLabel(seal.haulingPlan.resource).toLowerCase();
  if (seal.haulingPlan.stage === "pickup") {
    setSealTask(seal, TASKS.haulPickup, source.position, `Collecting ${resourceName} from ${source.name}`);
    if (moveSealTowardTarget(seal, deltaSeconds)) return;
    if (pickupHaulingResource(seal, source, destination, seal.haulingPlan) <= 0) {
      seal.haulingPlan = null;
      return;
    }
    seal.haulingPlan.stage = "deposit";
    return;
  }
  setSealTask(seal, TASKS.haulDeposit, destination.position, `Delivering ${resourceName} to ${destination.name}`);
  if (moveSealTowardTarget(seal, deltaSeconds)) return;
  depositCarriedResource(seal, destination, seal.haulingPlan);
  seal.haulingPlan = null;
}

function pickupHaulingResource(seal, source, destination, plan) {
  const capacity = getDestinationResourceCapacity(destination, plan);
  const amount = Math.min(CONFIG.sealCarryCapacity, getHaulingSourceAmount(source, plan), capacity);
  if (amount <= 0) return 0;
  removeFacilityResource(source, plan, amount);
  seal.carryingItem = plan.resource;
  seal.carryingAmount = amount;
  return amount;
}

function depositCarriedResource(seal, destination, plan) {
  if (destination.type === FACILITY_TYPES.storage) depositResourceToStorage(seal, destination, plan.resource);
  if (destination.type === FACILITY_TYPES.dryingRack && plan.destinationInventory === "input") depositFishToDryingRack(seal, destination);
}

function removeFacilityResource(facility, plan, amount) {
  if (amount <= 0) return;
  if (facility.type === FACILITY_TYPES.fishingSpot && plan.resource === RESOURCES.fish) facility.inventory.fish -= amount;
  if (facility.type === FACILITY_TYPES.storage) removeStorageResource(facility, plan.resource, amount);
  if (facility.type === FACILITY_TYPES.dryingRack && plan.resource === RESOURCES.driedFish) facility.inventory.outputs.driedFish -= amount;
}

function getDestinationResourceCapacity(destination, plan) {
  if (destination.type === FACILITY_TYPES.storage) return getStorageFreeCapacity(destination);
  if (destination.type === FACILITY_TYPES.dryingRack && plan.destinationInventory === "input") return destination.inventory.inputs.fishMax - destination.inventory.inputs.fish;
  return 0;
}

function depositFishToDryingRack(seal, facility) {
  if (seal.carryingItem !== RESOURCES.fish || seal.carryingAmount <= 0) return;
  const capacity = facility.inventory.inputs.fishMax - facility.inventory.inputs.fish;
  const deposited = Math.min(capacity, seal.carryingAmount);
  facility.inventory.inputs.fish += deposited;
  removeFromSealCargo(seal, deposited);
}

function depositFishToStorage(seal, storage) {
  depositResourceToStorage(seal, storage, RESOURCES.fish);
}

function depositResourceToStorage(seal, storage, resource) {
  if (seal.carryingItem !== resource || seal.carryingAmount <= 0) return;
  const deposited = Math.min(getStorageFreeCapacity(storage), seal.carryingAmount);
  storage.inventory[resource] = (storage.inventory[resource] || 0) + deposited;
  removeFromSealCargo(seal, deposited);
}

function removeFromSealCargo(seal, amount) {
  seal.carryingAmount -= amount;
  if (seal.carryingAmount <= 0) {
    seal.carryingItem = null;
    seal.carryingAmount = 0;
  }
}

function removeStorageResource(storage, resource, amount) {
  storage.inventory[resource] = Math.max(0, (storage.inventory[resource] || 0) - amount);
}

function updateWandering(state, seal, deltaSeconds) {
  if (!seal.targetPosition || samePosition(seal.position, seal.targetPosition)) {
    seal.wanderPause -= deltaSeconds;
    if (seal.wanderPause <= 0) {
      seal.targetPosition = getWanderPosition(seal.id, state.timing.animationTime);
      seal.wanderPause = CONFIG.wanderPauseSeconds;
    }
  }
  setSealTask(seal, TASKS.wandering, seal.targetPosition, "No hauling work available");
  moveSealTowardTarget(seal, deltaSeconds);
}

function getWanderPosition(seed, time) {
  const beachMinY = CONFIG.seaRows + 3;
  const x = 4 + ((seed * 7 + Math.floor(time * 0.3) * 5) % (CONFIG.gridSize - 8));
  const y = beachMinY + ((seed * 5 + Math.floor(time * 0.2) * 3) % (CONFIG.gridSize - beachMinY - 3));
  return { x, y };
}

function isHungry(seal) {
  return seal.hunger >= CONFIG.hungerEatThreshold;
}

function findStorageWithFish(state) {
  return findStorageWithResource(state, RESOURCES.fish);
}

function findStorageWithResource(state, resource) {
  return state.facilities.find((facility) => facility.type === FACILITY_TYPES.storage && (facility.inventory[resource] || 0) > 0);
}

function findStorageWithFood(state) {
  return state.facilities.find((facility) => facility.type === FACILITY_TYPES.storage && Boolean(chooseBestStoredFood(facility)));
}

function chooseBestStoredFood(storage) {
  if ((storage.inventory.driedFish || 0) > 0) return { resource: RESOURCES.driedFish, label: "Dried Fish", hungerRestored: CONFIG.hungerReducedPerDriedFish };
  if ((storage.inventory.fish || 0) > 0) return { resource: RESOURCES.fish, label: "Fish", hungerRestored: CONFIG.hungerReducedPerFish };
  return null;
}

function findStorageForEmergencyDeposit(state) {
  return state.facilities.find((facility) => facility.type === FACILITY_TYPES.storage && getStorageFreeCapacity(facility) > 0);
}

function isStorageAcceptingFishWithCapacity(facility) {
  return isStorageAcceptingResourceWithCapacity(facility, RESOURCES.fish);
}

function isStorageAcceptingResourceWithCapacity(facility, resource) {
  return facility.type === FACILITY_TYPES.storage && facility.acceptedResources[resource] && getStorageFreeCapacity(facility) > 0;
}

function getStorageFreeCapacity(storage) {
  return Math.max(0, storage.inventory.max - getStorageUsed(storage));
}

function getStorageUsed(storage) {
  return (storage.inventory.fish || 0) + (storage.inventory.driedFish || 0);
}

function setSealTask(seal, task, targetPosition, statusText) {
  if (seal.currentTask !== task) seal.actionProgress = 0;
  seal.currentTask = task;
  seal.targetPosition = targetPosition ? { x: targetPosition.x, y: targetPosition.y } : null;
  seal.statusText = statusText;
}

function moveSealTowardTarget(seal, deltaSeconds) {
  if (!seal.targetPosition || samePosition(seal.position, seal.targetPosition)) return false;
  seal.position = movePointToward(seal.position, seal.targetPosition, CONFIG.sealMoveTilesPerSecond * deltaSeconds);
  return !samePosition(seal.position, seal.targetPosition);
}

function movePointToward(position, target, distance) {
  const next = { x: position.x, y: position.y };
  let remaining = distance;
  remaining = moveAxisToward(next, target, "x", remaining);
  moveAxisToward(next, target, "y", remaining);
  return next;
}

function moveAxisToward(position, target, axis, distance) {
  const difference = target[axis] - position[axis];
  const step = Math.sign(difference) * Math.min(Math.abs(difference), distance);
  position[axis] += step;
  return distance - Math.abs(step);
}

function updateVisualEffects(state, deltaSeconds) {
  state.visualEffects = state.visualEffects.map((effect) => ({ ...effect, age: effect.age + deltaSeconds })).filter((effect) => effect.age < effect.duration);
}

function addFloatingTextEffect(state, text, position, color) {
  state.visualEffects.push({ text, position: { x: position.x, y: position.y }, color, age: 0, duration: CONFIG.floatingTextDuration });
}

function checkGameOver(state) {
  const starvingSeal = state.seals.find((seal) => seal.hunger >= CONFIG.maxHunger);
  if (!starvingSeal || getTotalStoredFood(state) > 0) return;
  state.phase = "gameover";
  state.message = `Game over: ${starvingSeal.name} reached maximum hunger with no stored food.`;
  starvingSeal.currentTask = TASKS.starving;
  ui.startButton.textContent = "Restart Colony";
}

function render(state) {
  renderWorld(state);
  renderUi(state);
}

function renderWorld(state) {
  clearCanvas();
  drawMap(state.map);
  state.facilities.forEach((facility) => drawFacility(state, facility));
  state.seals.forEach((seal) => drawSeal(state, seal));
  drawVisualEffects(state.visualEffects);
  drawOverlay(state);
}

function clearCanvas() {
  context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawMap(map) {
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) drawTile(x, y, map.tiles[y][x]);
  }
}

function drawTile(x, y, type) {
  context.fillStyle = type === "sea" ? "#1a8fbd" : "#d4b071";
  context.fillRect(x * CONFIG.tileSize, y * CONFIG.tileSize, CONFIG.tileSize, CONFIG.tileSize);
  context.strokeStyle = type === "sea" ? "rgba(160,230,255,0.16)" : "rgba(70,45,12,0.15)";
  context.strokeRect(x * CONFIG.tileSize, y * CONFIG.tileSize, CONFIG.tileSize, CONFIG.tileSize);
}

function drawFacility(state, facility) {
  const rect = facilityRect(facility);
  const selected = isSelected(state, "facility", facility.id);
  if (facility.type === FACILITY_TYPES.fishingSpot) drawFishingSpot(facility, rect);
  if (facility.type === FACILITY_TYPES.dryingRack) drawDryingRack(facility, rect);
  if (facility.type === FACILITY_TYPES.storage) drawStorage(facility, rect);
  if (selected) drawSelectionRing(rect);
  drawFacilityLabel(facility, rect);
}

function drawFishingSpot(facility, rect) {
  drawAssetOrPlaceholder(ASSETS.fishingSpot, rect.x, rect.y, rect.width, rect.height, "🎣");
  context.save();
  context.fillStyle = "rgba(6,19,26,0.86)";
  context.strokeStyle = "#9bedff";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(rect.x + 8, rect.y + rect.height - 24, rect.width - 16, 22, 8);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "900 12px sans-serif";
  context.textAlign = "center";
  context.fillText(`${facility.inventory.fish}/${facility.inventory.fishMax} fish`, rect.x + rect.width / 2, rect.y + rect.height - 9);
  context.restore();
}

function drawDryingRack(facility, rect) {
  drawAssetOrPlaceholder(ASSETS.dryingRack, rect.x, rect.y, rect.width, rect.height, "☀️");
  const progressPercent = Math.round(getProductionProgressPercent(facility));
  drawInventorySign(`🐟${facility.inventory.inputs.fish} → 🐠${facility.inventory.outputs.driedFish}`, rect.x + rect.width / 2, rect.y - 12);
  drawProgressBar(rect.x + 8, rect.y + rect.height - 16, rect.width - 16, 8, progressPercent / 100);
}

function drawStorage(facility, rect) {
  drawAssetOrPlaceholder(ASSETS.storage, rect.x, rect.y, rect.width, rect.height, "📦");
  drawInventorySign(`🐟${facility.inventory.fish} 🐠${facility.inventory.driedFish}`, rect.x + rect.width / 2, rect.y - 12);
}

function drawProgressBar(x, y, width, height, ratio) {
  context.save();
  context.fillStyle = "rgba(6,19,26,0.86)";
  context.strokeStyle = "#fff1a8";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x, y, width, height, 4);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffd166";
  context.beginPath();
  context.roundRect(x + 2, y + 2, Math.max(0, width - 4) * clamp(ratio, 0, 1), Math.max(0, height - 4), 3);
  context.fill();
  context.restore();
}

function drawSelectionRing(rect) {
  context.save();
  context.strokeStyle = "#fff1a8";
  context.lineWidth = 4;
  context.setLineDash([8, 5]);
  context.strokeRect(rect.x - 5, rect.y - 5, rect.width + 10, rect.height + 10);
  context.restore();
}

function drawFacilityLabel(facility, rect) {
  drawTextLabel(getFacilityTypeLabel(facility.type), rect.x + rect.width / 2, rect.y + rect.height + 15, "#30200d", "900 12px sans-serif");
}

function drawSeal(state, seal) {
  const rect = gridRect(seal.position.x, seal.position.y, CONFIG.assetSizeRatio);
  const moving = seal.targetPosition && !samePosition(seal.position, seal.targetPosition);
  const bob = Math.sin(state.timing.animationTime * (moving ? 12 : 3) + seal.id) * (moving ? 3 : 1.2);
  const drawRect = { x: rect.x, y: rect.y + bob, width: rect.size, height: rect.size };
  if (isSelected(state, "seal", seal.id)) drawSelectionRing({ x: drawRect.x, y: drawRect.y, width: drawRect.width, height: drawRect.height });
  drawAssetOrPlaceholder(ASSETS.seal, drawRect.x, drawRect.y, drawRect.width, drawRect.height, `${seal.id}`);
  context.save();
  context.fillStyle = "#06131a";
  context.font = "900 10px sans-serif";
  context.textAlign = "center";
  context.fillText(seal.name, drawRect.x + drawRect.width / 2, drawRect.y + drawRect.height + 9);
  context.restore();
  if (seal.carryingItem) drawCarriedResourceStack(drawRect.x + drawRect.width / 2, drawRect.y - 11, seal.carryingAmount, seal.carryingItem);
  drawTaskBadge(seal, drawRect);
  drawHungerWarning(seal, drawRect);
}

function drawTaskBadge(seal, rect) {
  const icon = getTaskIcon(seal.currentTask);
  context.save();
  context.fillStyle = "rgba(6,19,26,0.86)";
  context.strokeStyle = "rgba(255,255,255,0.7)";
  context.beginPath();
  context.roundRect(rect.x + rect.width - 3, rect.y - 10, 24, 20, 8);
  context.fill();
  context.stroke();
  context.font = "14px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(icon, rect.x + rect.width + 9, rect.y);
  context.restore();
}

function getTaskIcon(task) {
  if (task === TASKS.fishing) return "🎣";
  if (task === TASKS.haulPickup || task === TASKS.haulDeposit) return "📦";
  if (task === TASKS.seekingFood || task === TASKS.eating) return "🍽";
  if (task === TASKS.wandering) return "…";
  if (task === TASKS.starving) return "!";
  return "•";
}

function drawHungerWarning(seal, rect) {
  if (seal.hunger < CONFIG.hungerCriticalThreshold) return;
  context.save();
  context.fillStyle = CONFIG.maxHunger <= seal.hunger ? "#ff6978" : "#ffd166";
  context.font = "900 18px sans-serif";
  context.textAlign = "center";
  context.fillText("!", rect.x + rect.width / 2, rect.y - 9);
  context.restore();
}

function drawCarriedResourceStack(centerX, y, amount, resource) {
  const visibleItems = Math.max(1, Math.min(amount, 5));
  const asset = getResourceAsset(resource);
  const fallback = resource === RESOURCES.driedFish ? "🐠" : "🐟";
  for (let index = 0; index < visibleItems; index += 1) {
    drawAssetOrPlaceholder(asset, centerX - 13 + index * 6, y - index * 2, 18, 18, fallback);
  }
}

function drawAssetOrPlaceholder(asset, x, y, width, height, label) {
  if (asset.loaded && !asset.failed) {
    context.drawImage(asset.image, x, y, width, height);
    return;
  }
  drawVisiblePlaceholder(asset, x, y, width, height, label);
}

function drawVisiblePlaceholder(asset, x, y, width, height, label) {
  context.save();
  context.fillStyle = asset.primaryColor;
  context.strokeStyle = asset.secondaryColor;
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(x, y, width, height, 9);
  context.fill();
  context.stroke();
  context.fillStyle = asset.secondaryColor;
  context.font = `900 ${Math.max(12, Math.floor(width * 0.28))}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + width / 2, y + height / 2);
  context.restore();
}

function drawInventorySign(text, x, y) {
  context.save();
  context.fillStyle = "rgba(6,19,26,0.92)";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x - 38, y - 13, 76, 26, 9);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "900 12px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x, y + 1);
  context.restore();
}

function drawTextLabel(text, x, y, color, font) {
  context.save();
  context.fillStyle = "rgba(255,246,221,0.88)";
  context.strokeStyle = "rgba(59,34,14,0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(x - 48, y - 12, 96, 24, 8);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x, y + 1);
  context.restore();
}

function drawVisualEffects(effects) {
  effects.forEach((effect) => {
    const progress = effect.age / effect.duration;
    const x = effect.position.x * CONFIG.tileSize + CONFIG.tileSize / 2;
    const y = effect.position.y * CONFIG.tileSize - progress * 30;
    context.save();
    context.globalAlpha = 1 - progress;
    context.fillStyle = effect.color;
    context.strokeStyle = "#3b220e";
    context.lineWidth = 4;
    context.font = "900 18px sans-serif";
    context.textAlign = "center";
    context.strokeText(effect.text, x, y);
    context.fillText(effect.text, x, y);
    context.restore();
  });
}

function drawOverlay(state) {
  if (state.phase === "playing") return;
  context.save();
  context.fillStyle = "rgba(3,12,18,0.62)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = "900 34px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(state.phase === "start" ? "Seal Colony Manager" : "Game Over", canvas.width / 2, canvas.height / 2 - 24);
  context.font = "700 16px sans-serif";
  context.fillText(state.message, canvas.width / 2, canvas.height / 2 + 20);
  context.restore();
}

function renderUi(state) {
  ui.seaFishValue.textContent = `${Math.floor(state.resources.seaFish)} / ${CONFIG.maxSeaFish}`;
  ui.storedFishValue.textContent = `${getTotalStoredResource(state, RESOURCES.fish)} / ${CONFIG.storageFishMax}`;
  ui.storedDriedFishValue.textContent = getTotalStoredResource(state, RESOURCES.driedFish);
  ui.sealCountValue.textContent = state.seals.length;
  ui.phaseValue.textContent = state.phase;
  ui.totalSealsValue.textContent = state.seals.length;
  ui.idleValue.textContent = getIdleCount(state);
  ui.fishingWorkersValue.textContent = state.frameLists.assignedWorkerIds.length;
  ui.haulersValue.textContent = state.frameLists.haulingSealIds.length;
  ui.wanderingValue.textContent = state.frameLists.wanderingSealIds.length;
  ui.messageValue.textContent = state.message;
  renderInspector(state);
}

function renderInspector(state) {
  const selection = state.selection;
  const selected = selection.type === "seal" ? getSealById(state, selection.id) : getFacilityById(state, selection.id);
  clearElement(ui.inspectorContent);
  if (!selected) {
    ui.inspectorContent.append(createInfoRow("Selection", "Nothing selected"));
    return;
  }
  if (selection.type === "seal") renderSealInspector(state, selected);
  if (selection.type === "facility" && selected.type === FACILITY_TYPES.fishingSpot) renderFishingSpotInspector(state, selected);
  if (selection.type === "facility" && selected.type === FACILITY_TYPES.dryingRack) renderDryingRackInspector(state, selected);
  if (selection.type === "facility" && selected.type === FACILITY_TYPES.storage) renderStorageInspector(selected);
}

function renderFishingSpotInspector(state, facility) {
  ui.inspectorContent.append(
    createInfoRow("Facility", facility.name),
    createPriorityControls(facility),
    createInfoRow("Worker Slots", facility.workerSlots),
    createInfoRow("Assigned Workers", `${getAssignedWorkers(state, facility.id).length} / ${facility.workerSlots}`),
    createInfoRow("Internal Fish", `${facility.inventory.fish} / ${facility.inventory.fishMax}`),
    createInfoRow("Fishing Efficiency", `${Math.round(getFishingEfficiency(state) * 100)}%`),
  );
}

function renderDryingRackInspector(state, facility) {
  ui.inspectorContent.append(
    createInfoRow("Facility", facility.name),
    createPriorityControls(facility),
    createInfoRow("Worker Slots", facility.workerSlots),
    createInfoRow("Assigned Workers", `${getAssignedWorkers(state, facility.id).length} / ${facility.workerSlots}`),
    createInfoRow("Input Fish", `${facility.inventory.inputs.fish} / ${facility.inventory.inputs.fishMax}`),
    createInfoRow("Output Dried Fish", `${facility.inventory.outputs.driedFish} / ${facility.inventory.outputs.driedFishMax}`),
    createInfoRow("Recipe", `${CONFIG.dryingRackFishPerBatch} Fish → ${CONFIG.dryingRackDriedFishPerBatch} Dried Fish`),
    createInfoRow("Production Progress", `${Math.round(getProductionProgressPercent(facility))}%`),
  );
}

function renderStorageInspector(facility) {
  ui.inspectorContent.append(
    createInfoRow("Facility", facility.name),
    createToggleRow("Accept Fish", facility.acceptedResources.fish, () => { facility.acceptedResources.fish = !facility.acceptedResources.fish; }),
    createToggleRow("Accept Dried Fish", facility.acceptedResources.driedFish, () => { facility.acceptedResources.driedFish = !facility.acceptedResources.driedFish; }),
    createToggleRow("Accept Water", facility.acceptedResources.water, () => { facility.acceptedResources.water = !facility.acceptedResources.water; }),
    createInfoRow("Fish", `${facility.inventory.fish} stored`),
    createInfoRow("Dried Fish", `${facility.inventory.driedFish} stored`),
    createInfoRow("Capacity", `${getStorageUsed(facility)} / ${facility.inventory.max}`),
  );
}

function renderSealInspector(state, seal) {
  const assigned = seal.assignedFacilityId ? getFacilityById(state, seal.assignedFacilityId)?.name : "None";
  const hungerRow = createInfoRow("Hunger", `${Math.floor(seal.hunger)} / ${CONFIG.maxHunger}`);
  const meter = createElement("div", "meter");
  const fill = createElement("span");
  fill.style.width = `${(seal.hunger / CONFIG.maxHunger) * 100}%`;
  meter.append(fill);
  hungerRow.append(meter);
  ui.inspectorContent.append(
    createInfoRow("Seal", `#${seal.id} ${seal.name}`),
    hungerRow,
    createInfoRow("Assigned Facility", assigned),
    createInfoRow("Current Task", seal.currentTask),
    createInfoRow("Carrying Item", seal.carryingItem ? `${getResourceLabel(seal.carryingItem)} x${seal.carryingAmount}` : "None"),
    createInfoRow("Target", seal.targetPosition ? `(${seal.targetPosition.x.toFixed(0)}, ${seal.targetPosition.y.toFixed(0)})` : "None"),
    createInfoRow("Status", seal.statusText),
  );
}

function createPriorityControls(facility) {
  const row = createElement("div", "info-row");
  row.append(createElement("span", "", "Priority"));
  const controls = createElement("div", "control-row");
  const minus = createElement("button", "small-button", "−");
  const value = createElement("strong", "", facility.priority);
  const plus = createElement("button", "small-button", "+");
  minus.type = "button";
  plus.type = "button";
  minus.addEventListener("click", () => { facility.priority = clamp(facility.priority - 1, 1, 5); });
  plus.addEventListener("click", () => { facility.priority = clamp(facility.priority + 1, 1, 5); });
  controls.append(minus, value, plus);
  row.append(controls);
  return row;
}

function createToggleRow(label, isOn, onClick) {
  const row = createElement("div", "toggle-row");
  row.append(createElement("span", "", label));
  const button = createElement("button", `toggle-button ${isOn ? "" : "off"}`, isOn ? "On" : "Off");
  button.type = "button";
  button.addEventListener("click", onClick);
  row.append(button);
  return row;
}

function createInfoRow(label, value) {
  const row = createElement("div", "info-row");
  row.append(createElement("span", "", label), createElement("strong", "", value));
  return row;
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
}

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function handleCanvasClick(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  const clickedSeal = [...gameState.seals].reverse().find((seal) => pointInSeal(x, y, seal));
  if (clickedSeal) {
    gameState.selection = { type: "seal", id: clickedSeal.id };
    return;
  }
  const clickedFacility = [...gameState.facilities].reverse().find((facility) => pointInRect(x, y, facilityRect(facility)));
  if (clickedFacility) gameState.selection = { type: "facility", id: clickedFacility.id };
}

function pointInSeal(x, y, seal) {
  const rect = gridRect(seal.position.x, seal.position.y, CONFIG.assetSizeRatio);
  return pointInRect(x, y, { x: rect.x, y: rect.y, width: rect.size, height: rect.size });
}

function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

function getFishingEfficiency(state) {
  return clamp(state.resources.seaFish / CONFIG.maxSeaFish, CONFIG.lowSeaFishEfficiencyFloor, 1);
}

function getWorkPositionForFacility(facility) {
  return { x: facility.position.x, y: Math.max(0, facility.position.y - 1) };
}

function getAssignedWorkers(state, facilityId) {
  return state.seals.filter((seal) => seal.assignedFacilityId === facilityId);
}

function getIdleCount(state) {
  return state.seals.filter((seal) => seal.currentTask === TASKS.idle || seal.currentTask === TASKS.waiting).length;
}

function getTotalStoredFish(state) {
  return getTotalStoredResource(state, RESOURCES.fish);
}

function getTotalStoredFood(state) {
  return getTotalStoredResource(state, RESOURCES.fish) + getTotalStoredResource(state, RESOURCES.driedFish);
}

function getTotalStoredResource(state, resource) {
  return state.facilities
    .filter((facility) => facility.type === FACILITY_TYPES.storage)
    .reduce((total, storage) => total + (storage.inventory[resource] || 0), 0);
}

function getProductionProgressPercent(facility) {
  if (!facility.production?.workRequired) return 0;
  return (facility.production.progress / facility.production.workRequired) * 100;
}

function getFacilityTypeLabel(type) {
  if (type === FACILITY_TYPES.fishingSpot) return "Fishing Spot";
  if (type === FACILITY_TYPES.dryingRack) return "Drying Rack";
  if (type === FACILITY_TYPES.storage) return "Storage";
  return "Facility";
}

function getResourceLabel(resource) {
  if (resource === RESOURCES.driedFish) return "Dried Fish";
  if (resource === RESOURCES.fish) return "Fish";
  return resource;
}

function getResourceAsset(resource) {
  if (resource === RESOURCES.driedFish) return ASSETS.driedFish;
  return ASSETS.fish;
}

function getFacilityById(state, id) {
  return state.facilities.find((facility) => facility.id === id);
}

function getSealById(state, id) {
  return state.seals.find((seal) => seal.id === id);
}

function isSelected(state, type, id) {
  return state.selection.type === type && state.selection.id === id;
}

function gridRect(gridX, gridY, tileRatio) {
  const size = CONFIG.tileSize * tileRatio;
  const offset = (CONFIG.tileSize - size) / 2;
  return { x: gridX * CONFIG.tileSize + offset, y: gridY * CONFIG.tileSize + offset, size };
}

function facilityRect(facility) {
  const size = CONFIG.tileSize * CONFIG.facilitySizeTiles;
  return { x: (facility.position.x + 0.5) * CONFIG.tileSize - size / 2, y: (facility.position.y + 0.5) * CONFIG.tileSize - size / 2, width: size, height: size };
}

function samePosition(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

ui.startButton.addEventListener("click", startGame);
ui.selectToolButton.addEventListener("click", () => { gameState.message = "Select mode active: click a seal or facility."; });
canvas.addEventListener("click", handleCanvasClick);
render(gameState);
requestAnimationFrame(gameLoop);
