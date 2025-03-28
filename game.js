import { shuffleArray, delay } from './utils.js';
import {
    elements,
    updatePlayerHandUI,
    updateStatsUI,
    updateFloorInfoUI,
    logMessage,
    clearLog,
    showDamageEffect,
    showHealEffect,
    animateCardPlay,
    showMomentumBurstEffect,
    showRewardUI,
    showGameOverUI,
    hideGameOverUI,
    showDeckUI,
    hideDeckUI,
    updateNextCardPreviewUI
} from './ui.js';
import { getCardTemplate, CARD_TEMPLATES } from './cards.js';
import { generateEnemyForFloor } from './enemies.js';
import {
    MAX_MOMENTUM,
    MOMENTUM_GAIN_DEFAULT,
    MOMENTUM_GAIN_ZERO_COST,
    DELAY_TURN_START,
    DELAY_PRE_ACTION,
    DELAY_PRE_EFFECT,
    DELAY_POST_EFFECT,
    DELAY_TURN_END,
    DELAY_MOMENTUM_BURST_PRE,
    DELAY_MOMENTUM_BURST_POST,
    NUM_REWARD_CHOICES,
    NUM_REWARD_PICKS
} from './constants.js';

const PLAYER_STARTING_DECK = ['strike', 'strike', 'strike', 'defend', 'defend', 'defend', 'iron_wave', 'quick_slash'];
const PLAYER_STARTING_HP = 50;
const PLAYER_STARTING_ENERGY = 3;
const PLAYER_MAX_HAND_SIZE = 1;
const ENEMY_HAND_SIZE = 5;
const MAX_HAND_SIZE = 10;
const BASE_DRAW = 1;

class CardBattler {
    constructor() {
        console.log('[Game] Initializing CardBattler...');
        this.player = null;
        this.enemy = null;
        this.currentFloor = 1;
        this.inBattle = false;
        this.battleTurn = 0;
        this.rewardPicksMade = 0;

        // Bind event listeners from UI elements
        console.log('[Game] Binding UI event listeners...');
        elements.startBattleBtn.addEventListener('click', () => this.startBattle());
        elements.nextFloorBtn.addEventListener('click', () => this.nextFloor());
        elements.viewDeckBtn.addEventListener('click', () => this.viewDeck());
        elements.restartBtn.addEventListener('click', () => this.restart());
        elements.backToGameBtn.addEventListener('click', () => this.hideViewDeck());

        // Initialize game
        this.setUpNewGame();
        console.log('[Game] CardBattler initialization complete.');
    }

    setUpNewGame() {
        console.log('[Game] Setting up new game...');
        this.currentFloor = 1;
        this.player = {
            name: 'Adventurer',
            hp: PLAYER_STARTING_HP,
            maxHp: PLAYER_STARTING_HP,
            energy: PLAYER_STARTING_ENERGY,
            maxEnergy: PLAYER_STARTING_ENERGY,
            block: 0,
            strength: 0,
            vulnerable: 0,
            berserk: 0,
            deck: [...PLAYER_STARTING_DECK],
            hand: [],
            drawPile: [],
            discardPile: [],
            statusEffects: {},
            momentum: 0,
            maxMomentum: MAX_MOMENTUM,
            momentumGainMultiplier: 1,
        };
        console.log('[Game] Player initialized:', JSON.parse(JSON.stringify(this.player)));

        updateFloorInfoUI(this.currentFloor);
        this.generateEnemy();
        clearLog();
        this.log('Welcome to Card Battler! Prepare for battle...', 'system');

        console.log('[Game] Enabling initial buttons.');
        elements.startBattleBtn.disabled = false;
        elements.nextFloorBtn.disabled = true;
        if (elements.rewardContainer) elements.rewardContainer.style.display = 'none';
        hideGameOverUI();
        hideDeckUI();
        this.updateStats();
        console.log('[Game] New game setup complete.');
    }

    generateEnemy() {
        console.log(`[Game] Generating enemy for floor ${this.currentFloor}...`);
        this.enemy = generateEnemyForFloor(this.currentFloor);
        console.log('[Game] Enemy generated:', JSON.parse(JSON.stringify(this.enemy)));
        if (elements.enemyName) elements.enemyName.textContent = this.enemy.name;
        this.updateStats();
    }

    startBattle() {
        console.log('[Game] Attempting to start battle...');
        if (this.inBattle) {
             console.warn('[Game] Battle already in progress. Ignoring startBattle call.');
             return;
        }
        console.log('[Game] Starting battle...');

        this.inBattle = true;
        this.battleTurn = 0;
        console.log(`[Game] Battle state set: inBattle=true, battleTurn=0`);

        this.player.hand = [];
        this.player.drawPile = shuffleArray([...this.player.deck]);
        this.player.discardPile = [];
        this.player.block = 0;
        this.player.energy = this.player.maxEnergy;
        this.player.vulnerable = 0;
        this.player.statusEffects = {};
        this.player.momentum = 0;
        console.log(`[Game] Player state reset. Draw pile size: ${this.player.drawPile.length}`);

        this.enemy.hand = [];
        this.enemy.drawPile = shuffleArray([...this.enemy.deck]);
        this.enemy.discardPile = [];
        this.enemy.block = 0;
        this.enemy.energy = this.enemy.maxEnergy;
        this.enemy.vulnerable = 0;
        console.log(`[Game] Enemy state reset. Draw pile size: ${this.enemy.drawPile.length}`);

        this.log(`Battle against ${this.enemy.name} begins!`, 'system');
        console.log(`[Game] Disabling buttons for battle start.`);
        elements.startBattleBtn.disabled = true;
        elements.nextFloorBtn.disabled = true;
        elements.viewDeckBtn.disabled = true;

        this.startPlayerTurn();
    }

    async startPlayerTurn() {
        console.log('[Game] Checking battle state before starting player turn...');
        if (!this.inBattle) {
            console.warn('[Game] startPlayerTurn called but not in battle. Aborting.');
            return;
        }

        this.battleTurn++;
        console.log(`[Game] Starting Player Turn ${this.battleTurn}`);
        this.log(`--- Player Turn ${this.battleTurn} ---`, 'system');

        this.player.block = 0;
        this.player.energy = this.player.maxEnergy;
        this.player.momentum = 0;

        if (this.player.berserk > 0) {
            console.log(`[Game] Applying player Berserk effect (${this.player.berserk})...`);
            this.player.energy += this.player.berserk;
            this.log(`${this.player.name} gains ${this.player.berserk} energy from Berserk.`, 'player');
            console.log(`[Game] Player energy increased to ${this.player.energy} by Berserk.`);

            const berserkDamage = this.player.berserk * 2;
            this.log(`${this.player.name} takes ${berserkDamage} damage from Berserk.`, 'player');
            console.log(`[Game] Player taking ${berserkDamage} self-damage from Berserk.`);
            const playerDied = this.dealDamage(this.player, this.player, berserkDamage, true);
            if (playerDied) {
                console.log('[Game] Player died from Berserk damage. Turn ended.');
                return;
            }
        }

        if (this.player.vulnerable > 0) {
             console.log(`[Game] Reducing player Vulnerable duration from ${this.player.vulnerable}.`);
             this.player.vulnerable--;
             if (this.player.vulnerable === 0) {
                this.log(`${this.player.name} is no longer Vulnerable.`, 'player');
                console.log(`[Game] Player is no longer Vulnerable.`);
             } else {
                 console.log(`[Game] Player Vulnerable duration now ${this.player.vulnerable}.`);
             }
        }

        // Draw cards up to hand size limit
        const cardsToDraw = PLAYER_MAX_HAND_SIZE - this.player.hand.length;
        console.log(`[Game] Player turn start. Hand size: ${this.player.hand.length}, Max size: ${PLAYER_MAX_HAND_SIZE}. Attempting to draw ${cardsToDraw > 0 ? cardsToDraw : 0} cards.`);
        if (cardsToDraw > 0) {
            this.log(`${this.player.name} draws ${cardsToDraw} card${cardsToDraw > 1 ? 's' : ''}.`, 'player');
            for (let i = 0; i < cardsToDraw; i++) {
                // Check hand size again inside loop in case drawCard shuffles and fails? No, drawCard handles burn.
                if (this.player.hand.length < PLAYER_MAX_HAND_SIZE) { // Double check just in case
                    this.drawCard(); // Handles reshuffle and burning if hand becomes full unexpectedly
                } else {
                    console.warn(`[Game] Skipped drawing card ${i+1}/${cardsToDraw} as hand reached max size unexpectedly.`);
                    break; // Stop drawing if hand is full
                }
            }
        } else {
             this.log(`${this.player.name}'s hand is full.`, 'player');
        }

        // Update UI after drawing
        updatePlayerHandUI(this.player.hand, this);
        this.updateNextCardPreview(); // Update after drawing

        // Schedule the first player action
        await delay(DELAY_PRE_ACTION); // Short delay before player AI acts
        this.playPlayerTurn();
    }

    async playPlayerTurn() {
        console.log('[Game] Executing automated player turn action...');
        if (!this.inBattle) {
             console.warn('[Game] playPlayerTurn called but not in battle. Aborting.');
             return;
        }

        await delay(DELAY_PRE_ACTION);

        const playableCardIndex = this.player.hand.length > 0 ? 0 : -1;
        const cardId = playableCardIndex !== -1 ? this.player.hand[playableCardIndex] : null;
        const cardTemplate = cardId ? getCardTemplate(cardId) : null;

        if (cardTemplate && this.player.energy >= cardTemplate.cost) {
            let spentMomentum = 0;
            if (cardTemplate.usesMomentum && this.player.momentum >= cardTemplate.momentumCost) {
                spentMomentum = cardTemplate.momentumCost;
                this.player.momentum -= spentMomentum;
                this.log(`Spent ${spentMomentum} momentum for ${cardTemplate.name}'s bonus effect.`, 'player');
                 console.log(`[Game] Player spent ${spentMomentum} momentum. Remaining: ${this.player.momentum}`);
            }

            this.player.energy -= cardTemplate.cost;

            this.player.hand.splice(playableCardIndex, 1);
            this.player.discardPile.push(cardId);
             console.log(`[Game] Card ${cardId} moved from hand to discard. Hand: ${this.player.hand.length}, Discard: ${this.player.discardPile.length}`);

            this.log(`Player plays ${cardTemplate.name} (Cost: ${cardTemplate.cost})`, 'player');
            this.updateStats();

            animateCardPlay(cardId, cardTemplate, true);
             console.log(`[Game] Card animation started for ${cardId}.`);

            await delay(DELAY_PRE_EFFECT);
             console.log(`[Game] Delay complete. Executing player card effect for ${cardId}...`);

            if (cardTemplate.effect) {
                cardTemplate.effect(this, this.player, this.enemy, spentMomentum);
                 console.log(`[Game] Card effect finished for ${cardId}.`);
            } else {
                 console.log(`[Game] Card ${cardId} has no effect function.`);
            }

            if (this.enemy.hp <= 0) {
                this.enemyDefeated();
                return;
            }

            let momentumGained = 0;
            if (cardTemplate.cost === 0) {
                momentumGained = MOMENTUM_GAIN_ZERO_COST;
            } else if (cardTemplate.cost === 1 || cardTemplate.cost === 2) {
                momentumGained = MOMENTUM_GAIN_DEFAULT;
            }

            if (momentumGained > 0) {
                this.player.momentum = Math.min(this.player.momentum + momentumGained, MAX_MOMENTUM);
                this.log(`Gained ${momentumGained} momentum. (Total: ${this.player.momentum})`, 'player');
                 console.log(`[Game] Player gained ${momentumGained} momentum. Total: ${this.player.momentum}`);
            }

            await delay(DELAY_POST_EFFECT);
             console.log('[Game] Post-effect delay complete.');

            console.log('[Game] Player played a card, drawing replacement...');
            this.drawCard();

            this.updateUI();
             console.log('[Game] UI updated after card effect and drawing replacement.');

            if (this.player.momentum >= MAX_MOMENTUM) {
                 console.log('[Game] Max momentum reached. Preparing burst effect...');
                await delay(DELAY_MOMENTUM_BURST_PRE);
                showMomentumBurstEffect();
                await delay(DELAY_MOMENTUM_BURST_POST);
                this.log('Maximum momentum reached! Ending turn.', 'system-warning');
                 console.log('[Game] Momentum burst finished. Ending turn.');
                this.endPlayerTurn();
                return;
            }

             console.log('[Game] Scheduling next player action check...');
            this.playPlayerTurn();

        } else {
            if (this.player.hand.length > 0) {
                this.log(`Player cannot afford ${cardTemplate.name} (Cost: ${cardTemplate.cost}, Energy: ${this.player.energy}).`, 'player');
                 console.log(`[Game] Player cannot afford card ${cardId}. Cost: ${cardTemplate.cost}, Energy: ${this.player.energy}.`);
            } else {
                this.log('Player has no card in hand.', 'player');
                 console.log('[Game] Player hand is empty.');
            }
             console.log('[Game] Player cannot play card. Ending turn.');
            this.endPlayerTurn();
        }
    }

    async endPlayerTurn() {
        console.log('[Game] Ending player turn.');
        this.log(`${this.player.name} ends their turn.`, 'system');
        await delay(DELAY_TURN_END);

        // Update UI to reflect empty hand (or potentially retained cards if logic changes)
        updatePlayerHandUI(this.player.hand, this);
        this.updateNextCardPreview(); // Update preview after potential discards (or lack thereof)

        // Start enemy turn
        this.startEnemyTurn();
    }

    startEnemyTurn() {
        console.log('[Game] Checking battle state before starting enemy turn...');
        if (!this.inBattle) {
            console.warn('[Game] startEnemyTurn called but not in battle. Aborting.');
            return;
        }

        console.log(`[Game] Starting Enemy Turn ${this.battleTurn}`);
        this.log(`${this.enemy.name}'s turn.`, 'enemy');

        this.enemy.block = 0;
        this.enemy.energy = this.enemy.maxEnergy;

        if (this.enemy.berserk > 0) {
            console.log(`[Game] Applying enemy Berserk effect (${this.enemy.berserk})...`);
            this.enemy.energy += this.enemy.berserk;
            this.log(`${this.enemy.name} gains ${this.enemy.berserk} energy from Berserk.`, 'enemy');
            console.log(`[Game] Enemy energy increased to ${this.enemy.energy} by Berserk.`);

            const berserkDamage = this.enemy.berserk * 2;
            this.log(`${this.enemy.name} takes ${berserkDamage} damage from Berserk.`, 'enemy');
             console.log(`[Game] Enemy taking ${berserkDamage} self-damage from Berserk.`);
            const enemyDied = this.dealDamage(this.enemy, this.enemy, berserkDamage, true);
            if (enemyDied) {
                console.log('[Game] Enemy died from Berserk damage. Turn ended.');
                return;
            }
        }

        if (this.enemy.vulnerable > 0) {
             console.log(`[Game] Reducing enemy Vulnerable duration from ${this.enemy.vulnerable}.`);
             this.enemy.vulnerable--;
             if (this.enemy.vulnerable === 0) {
                this.log(`${this.enemy.name} is no longer Vulnerable.`, 'enemy');
                console.log(`[Game] Enemy is no longer Vulnerable.`);
             } else {
                 console.log(`[Game] Enemy Vulnerable duration now ${this.enemy.vulnerable}.`);
             }
        }

        console.log(`[Game] Enemy drawing up to ${ENEMY_HAND_SIZE} cards.`);
        this.enemy.hand = [];
        for (let i = 0; i < ENEMY_HAND_SIZE; i++) {
            if (this.enemy.drawPile.length === 0 && this.enemy.discardPile.length > 0) {
                console.log(`[Game] Enemy draw pile empty. Shuffling discard pile (${this.enemy.discardPile.length} cards)...`);
                this.enemy.drawPile = shuffleArray([...this.enemy.discardPile]);
                this.enemy.discardPile = [];
                this.log(`${this.enemy.name} shuffles their discard pile.`, 'enemy');
                console.log(`[Game] Enemy discard pile shuffled into draw pile. Draw size: ${this.enemy.drawPile.length}`);
            }
            if (this.enemy.drawPile.length > 0) {
                this.enemy.hand.push(this.enemy.drawPile.pop());
            } else {
                 console.log(`[Game] Enemy draw pile empty, cannot draw more cards.`);
                 break;
            }
        }
        console.log(`[Game] Enemy finished drawing. Hand size: ${this.enemy.hand.length}`);

        this.updateStats();
        console.log('[Game] Stats updated after enemy draw.');

        console.log('[Game] Scheduling enemy turn action...');
        setTimeout(() => this.playEnemyTurn(), DELAY_TURN_START);
    }

    async playEnemyTurn() {
        console.log('[Game] Executing enemy turn action...');
        if (!this.inBattle) {
             console.warn('[Game] playEnemyTurn called but not in battle. Aborting.');
             return;
        }

        await delay(DELAY_PRE_ACTION);

        const playableCardIndex = this.enemy.hand.findIndex(cardId => {
            const template = getCardTemplate(cardId);
            return template && this.enemy.energy >= template.cost;
        });

        if (playableCardIndex !== -1) {
            const cardId = this.enemy.hand[playableCardIndex];
            const cardTemplate = getCardTemplate(cardId);
             console.log(`[Game] AI checking card: ${cardId} (Cost: ${cardTemplate.cost}, Enemy Energy: ${this.enemy.energy})`);

            if (cardTemplate) {
                this.enemy.hand.splice(playableCardIndex, 1);
                 console.log(`[Game] Card ${cardId} removed from enemy hand. Hand size: ${this.enemy.hand.length}`);

                this.enemy.energy -= cardTemplate.cost;
                console.log(`[Game] Enemy energy after cost: ${this.enemy.energy}`);

                this.log(`${this.enemy.name} plays ${cardTemplate.name}.`, 'enemy');
                animateCardPlay(cardId, cardTemplate, false);
                this.updateStats();
                console.log('[Game] Stats updated after enemy paying cost.');

                await delay(DELAY_PRE_EFFECT);
                console.log('[Game] Delay complete. Executing enemy card effect...');

                cardTemplate.effect(this, this.enemy, this.player);
                console.log(`[Game] Card effect for ${cardId} finished.`);
                this.enemy.discardPile.push(cardId);
                console.log(`[Game] Card ${cardId} moved to enemy discard pile. Discard size: ${this.enemy.discardPile.length}`);

                await delay(DELAY_POST_EFFECT);
                 console.log('[Game] Post-effect delay complete.');

                this.updateUI();
                console.log('[Game] UI updated after enemy card effect.');

                await delay(DELAY_POST_EFFECT);
                 console.log('[Game] Post-effect delay complete.');

                if (this.player.hp <= 0) {
                    this.playerDefeated();
                    return;
                }
                if (this.enemy.hp <= 0) {
                    this.enemyDefeated();
                    return;
                }

                 console.log('[Game] Scheduling next enemy action check...');
                 this.playEnemyTurn();

            } else {
                this.log(`Error: Card template not found for ID: ${cardId}`, 'error');
                 console.error(`[Game] Card template not found for ID: ${cardId}. Ending turn.`);
                this.endEnemyTurn();
            }
        } else {
            this.log('Enemy has no more playable cards.', 'enemy');
             console.log('[Game] Enemy has no more playable cards. Ending turn.');
            this.endEnemyTurn();
        }
    }

    endEnemyTurn() {
        console.log('[Game] Ending enemy turn...');
        this.log(`${this.enemy.name} ends their turn.`, 'enemy');

        console.log(`[Game] Discarding enemy hand. Hand size: ${this.enemy.hand.length}`);
        this.enemy.discardPile.push(...this.enemy.hand);
        this.enemy.hand = [];
        console.log(`[Game] Enemy hand discarded. Discard size: ${this.enemy.discardPile.length}`);

        this.updateStats();
        console.log('[Game] Stats updated after enemy turn end.');

        console.log('[Game] Scheduling player turn start...');
        setTimeout(() => this.startPlayerTurn(), DELAY_TURN_END);
    }

    drawCard() {
        console.log(`[Game] Attempting to draw card. Hand: ${this.player.hand.length}/${PLAYER_MAX_HAND_SIZE}`);
        if (this.player.hand.length >= PLAYER_MAX_HAND_SIZE) {
            console.log(`[Game] Player hand is full (${this.player.hand.length}). Burning next card.`);
            // Burn card: Draw from pile and immediately discard
            if (this.player.drawPile.length === 0) {
                if (this.player.discardPile.length === 0) {
                    console.log(`[Game] No cards left in draw or discard to burn.`);
                     this.log(`${this.player.name} has no cards left to draw or burn.`, 'player');
                     this.updateNextCardPreview(); // Ensure preview is updated
                    return; // Nothing to draw or burn
                }
                // Reshuffle if draw pile is empty
                console.log(`[Game] Player draw pile empty for burning. Shuffling discard pile (${this.player.discardPile.length} cards)...`);
                this.player.drawPile = shuffleArray([...this.player.discardPile]);
                this.player.discardPile = [];
                this.log(`${this.player.name} shuffles their discard pile.`, 'player');
                console.log(`[Game] Player discard pile shuffled into draw pile. Draw size: ${this.player.drawPile.length}`);
            }
            // Burn the card
            const burnedCardId = this.player.drawPile.pop();
            this.player.discardPile.push(burnedCardId);
            const burnedCardTemplate = getCardTemplate(burnedCardId);
            this.log(`${this.player.name} burns ${burnedCardTemplate?.name || 'a card'} (hand full).`, 'player-fade');
            console.log(`[Game] Burned card: ${burnedCardId}. Discard pile size: ${this.player.discardPile.length}`);
            this.updateNextCardPreview(); // Update after burning
            return; // Card burned, do not add to hand
        }

        if (this.player.drawPile.length === 0 && this.player.discardPile.length > 0) {
            console.log(`[Game] Player draw pile empty. Shuffling discard pile (${this.player.discardPile.length} cards)...`);
            this.player.drawPile = shuffleArray([...this.player.discardPile]);
            this.player.discardPile = [];
            this.log(`${this.player.name} shuffles their discard pile.`, 'player');
            console.log(`[Game] Player discard pile shuffled into draw pile. Draw size: ${this.player.drawPile.length}`);
        }

        if (this.player.drawPile.length > 0) {
            const cardId = this.player.drawPile.pop();
            this.player.hand.push(cardId);
            console.log(`[Game] Player drew card: ${cardId}. Hand size: ${this.player.hand.length}, Draw pile size: ${this.player.drawPile.length}`);
        } else {
            console.log(`[Game] Player has no cards left in draw or discard piles.`);
            this.log(`${this.player.name} has no cards left to draw.`, 'player');
        }

        this.updateNextCardPreview();
    }

    updateNextCardPreview() {
        updateNextCardPreviewUI(this.player.drawPile, this.player.berserk > 0);
    }

    dealDamage(source, target, amount, ignoreBlock = false) {
        console.log(`[Game] Calculating damage: ${source.name} -> ${target.name}, Base amount: ${amount}, Ignore block: ${ignoreBlock}`);
        if (amount <= 0) {
             console.log('[Game] Damage amount is zero or less. No damage dealt.');
             return false;
        }

        let finalAmount = amount;

        if (source !== target && source.strength) {
            console.log(`[Game] Applying source strength bonus: +${source.strength}`);
            finalAmount += source.strength;
        }

        if (target.vulnerable > 0) {
            const vulnerableMultiplier = 1.5;
            const amountBeforeVulnerable = finalAmount;
            finalAmount = Math.floor(finalAmount * vulnerableMultiplier);
            console.log(`[Game] Applying target Vulnerable bonus (${target.vulnerable} turns): ${amountBeforeVulnerable} * ${vulnerableMultiplier} -> ${finalAmount}`);
        }

        let damageDealt = finalAmount;
        let blockedAmount = 0;

        if (!ignoreBlock && target.block > 0) {
            console.log(`[Game] Target has ${target.block} block. Applying block...`);
            blockedAmount = Math.min(target.block, finalAmount);
            target.block -= blockedAmount;
            damageDealt = finalAmount - blockedAmount;
            if (blockedAmount > 0) {
                 this.log(`${target.name}'s block absorbs ${blockedAmount} damage.`, source === this.player ? 'player' : 'enemy');
                 console.log(`[Game] Block absorbed ${blockedAmount} damage. Remaining block: ${target.block}`);
            }
        } else if (ignoreBlock) {
            console.log(`[Game] Ignoring target block (${target.block}).`);
        } else {
             console.log(`[Game] Target has no block.`);
        }

        if (damageDealt > 0) {
             console.log(`[Game] Dealing ${damageDealt} damage to ${target.name}'s HP (${target.hp}).`);
            target.hp -= damageDealt;
            this.log(`${source.name} deals ${damageDealt} damage to ${target.name}.`, source === this.player ? 'player' : 'enemy');
            console.log(`[Game] ${target.name} HP after damage: ${target.hp}`);

            let targetElement = null;
            if (target === this.player) {
                targetElement = elements.player;
                 console.log('[Game] Damage target identified as player. Using player element.');
            } else if (target === this.enemy) {
                targetElement = elements.enemyContainer;
                 console.log('[Game] Damage target identified as enemy. Using enemy container element.');
            } else {
                 console.warn('[Game] Could not determine target type (player/enemy) for damage effect.');
            }

            if (targetElement) {
                showDamageEffect(targetElement, damageDealt);
            } else {
                console.warn(`[Game] Could not find UI element for target '${target?.name || 'UNKNOWN'}' to apply damage effect.`);
            }
        } else {
             console.log('[Game] No damage dealt to HP after block application.');
        }

        this.updateStats();
        console.log('[Game] Stats updated after damage calculation.');

        if (target.hp <= 0) {
            console.log(`[Game] Target ${target.name} HP reached zero or below.`);
            target.hp = 0;
            if (target === this.enemy) {
                console.log('[Game] Enemy defeated.');
                this.enemyDefeated();
                return true;
            } else {
                console.log('[Game] Player defeated.');
                this.gameOver();
                return true;
            }
        }
        console.log(`[Game] Target ${target.name} survived the damage.`);
        return false;
    }

    enemyDefeated() {
        console.log('[Game] Processing enemy defeat...');
        this.inBattle = false;
        console.log('[Game] Battle state set: inBattle=false');
        this.log(`${this.enemy.name} has been defeated!`, 'reward');
        this.updateStats();

        console.log('[Game] Showing reward screen and enabling next floor button.');
        this.startRewardPhase();
        elements.nextFloorBtn.disabled = false;
        elements.viewDeckBtn.disabled = false;

        console.log('[Game] Enemy defeat processing complete.');
        this.player.berserk = 0;
    }

    startRewardPhase() {
        console.log('[Game] Starting reward phase.');
        this.rewardPicksMade = 0;
        this.presentSingleRewardChoice();
    }

    presentSingleRewardChoice() {
        if (this.rewardPicksMade >= NUM_REWARD_PICKS) {
            console.error("[Game] Attempted to present reward choice when all picks are made.");
            this.nextFloor();
            return;
        }
        console.log(`[Game] Presenting reward choice ${this.rewardPicksMade + 1} of ${NUM_REWARD_PICKS}`);

        const availableCards = Object.values(CARD_TEMPLATES).filter(card => card.rarity !== 'Starter');
        const shuffledCards = shuffleArray([...availableCards]);
        const rewardCardIds = [];
        for (let i = 0; i < NUM_REWARD_CHOICES && i < shuffledCards.length; i++) {
            const cardTemplate = shuffledCards[i];
             console.log(`[Game] Offering reward card for pick ${this.rewardPicksMade + 1}: ${cardTemplate.id}`);
            rewardCardIds.push(cardTemplate.id);
        }

        console.log(`[Game] Displaying reward UI for pick ${this.rewardPicksMade + 1}. Cards: ${rewardCardIds.join(', ')}`);
        showRewardUI(
            rewardCardIds,
            this.rewardPicksMade + 1,
            NUM_REWARD_PICKS,
            this.handleSingleRewardChoice.bind(this)
        );
    }

    handleSingleRewardChoice(chosenCardId) {
        console.log(`[Game] Handling reward choice ${this.rewardPicksMade + 1}. Chosen card ID: ${chosenCardId}`);

        if (chosenCardId) {
            this.player.deck.push(chosenCardId);
            const cardTemplate = getCardTemplate(chosenCardId);
            this.log(`Added ${cardTemplate.name} to your deck! (Pick ${this.rewardPicksMade + 1}/${NUM_REWARD_PICKS})`, 'reward');
            console.log(`[Game] Added ${chosenCardId} to player deck.`);
        } else {
            this.log(`Skipped reward pick ${this.rewardPicksMade + 1}/${NUM_REWARD_PICKS}.`, 'system');
            console.log(`[Game] Player skipped pick ${this.rewardPicksMade + 1}.`);
        }

        this.rewardPicksMade++;

        if (this.rewardPicksMade < NUM_REWARD_PICKS) {
            console.log('[Game] More picks remaining, presenting next choice.');
            this.presentSingleRewardChoice();
        } else {
            console.log('[Game] All reward picks made. Proceeding to next floor.');
            this.nextFloor();
        }
    }

    nextFloor() {
        console.log(`[Game] Advancing to next floor from floor ${this.currentFloor}.`);
        if (elements.rewardContainer.style.display !== 'none') {
            elements.rewardContainer.style.display = 'none';
            elements.rewardContainer.classList.remove('modal-active');
        }

        elements.nextFloorBtn.disabled = true;
        this.currentFloor++;
        updateFloorInfoUI(this.currentFloor);

        console.log('[Game] Healing player between floors.');
        const hpBeforeHeal = this.player.hp;
        const amountHealed = this.player.maxHp - hpBeforeHeal;
        if (amountHealed > 0) {
            this.player.hp = this.player.maxHp;
            showHealEffect(elements.player, amountHealed);
            this.log(`Rested and fully restored HP! (+${amountHealed} HP)`, 'system');
            console.log(`[Game] Player healed to full HP (${this.player.maxHp}). Healed for ${amountHealed}.`);
        } else {
            console.log('[Game] Player already at full HP.');
        }

        console.log('[Game] Generating enemy for the new floor.');
        this.enemy = generateEnemyForFloor(this.currentFloor);
        this.updateStats();

        elements.startBattleBtn.disabled = false;
        console.log(`[Game] Ready for Floor ${this.currentFloor}.`);
    }

    gameOver() {
        console.log(`[Game] Game Over.`);
        this.inBattle = false;
        console.log('[Game] Battle state set: inBattle=false');
        showGameOverUI(false, this.currentFloor);
        this.log('Game over! You have been defeated.', 'system');

        elements.startBattleBtn.disabled = true;
        elements.nextFloorBtn.disabled = true;
        elements.viewDeckBtn.disabled = true;
        console.log('[Game] Game over buttons disabled.');
    }

    restart() {
        console.log('[Game] Restarting game...');
        this.setUpNewGame();
        console.log('[Game] Game restart complete.');
    }

    viewDeck() {
        console.log('[Game] Showing deck view UI...');
        showDeckUI(this.player);
    }

    hideViewDeck() {
         console.log('[Game] Hiding deck view UI...');
        hideDeckUI();
    }

    updateUI() {
        console.log('[Game] Updating UI (Stats, Hand, Next Card)...');
        this.updateStats();
        updatePlayerHandUI(this.player.hand);
        this.updateNextCardPreview();
        console.log('[Game] updatePlayerHandUI & updateNextCardPreviewUI called.');
    }

    updateStats() {
        console.log('[Game] Updating stats via Game.updateStats()...');
        if (this.player) {
            updateStatsUI(this.player, this.enemy);
        } else {
            console.warn('[Game] Attempted to update stats, but player object is missing.');
        }
    }

    log(message, type = 'system') {
        logMessage(message, type);
    }

    playerDefeated() {
        console.log('[Game] Player has been defeated.');
        this.gameOver();
    }
}

window.addEventListener('load', () => {
    console.log('[Game] Window loaded. Initializing game instance.');
    const game = new CardBattler();
}); 