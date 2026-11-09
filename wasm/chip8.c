#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#include <time.h>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

#include <SDL.h>

// SDL Window Object
typedef struct {
	SDL_Window *window;
	SDL_Renderer *renderer;
	SDL_AudioSpec want, have;
	SDL_AudioDeviceID dev;
} sdl_t;

// emulator configuration options
typedef struct {
	uint32_t window_height;
	uint32_t window_width;
	uint32_t fg_color; // foreground RGBA8888
	uint32_t bg_color; // background RGBA8888
	uint32_t scale_factor; // amount to scale each chip8 pixel e.g. 15x will be a 15 times larger window
	bool pixel_outlines; // draws pixel outline
	uint32_t clock_rate; // CPU clock rate or HZ
	uint32_t square_wave_freq; // frequency of sound wave
	uint32_t audio_sample_rate;
	int16_t volume; //how loud the sound is
} user_config_t;

// emulator states
typedef enum {
	QUIT,
	RUNNING,
	PAUSED,
} emulator_state_t;


typedef struct {
	uint16_t opcode; 
	uint16_t NNN; // 12 bit address
	uint16_t NN; // 8 bit constant
	uint16_t N; // 4 bit constant
	uint8_t X; // 4 bit register identifier
	uint8_t Y; // 4 bit register identifier

} instruction_t;

// chip8 machine
typedef struct {
	emulator_state_t state;
	uint8_t ram[4096]; // set machine memory
	bool display[64*32]; // emulate original chip8 display 
	uint16_t stack[12]; // the subroutine stack
	uint16_t *stack_ptr; // the subroutine stack
	uint8_t V[16]; // data registers from V0-Vf
	uint16_t I; // index register
	uint16_t PC; // program counter
	uint8_t delay_timer; // counts down at 60hz when > 0
	uint8_t sound_timer; // counts down at 60hz when > 0 and plays a tone when > 0
	bool keypad[16]; // hexadecimal keypad from 0x0-0xF
	const char *rom_name; // rom file name
	instruction_t inst; // currently executing instruction
} chip8_t;

void audio_callback(void *userdata, uint8_t *stream, int len) {
	user_config_t *config = (user_config_t *)userdata;
	
	int16_t *audio_data = (int16_t *)stream;
	static uint32_t running_sample_index = 0;
	const int32_t square_wave_period = config->audio_sample_rate / config->square_wave_freq;
	const int32_t half_square_wave_period = square_wave_period / 2;

	for (int i = 0; i < len / 2; i++) {
		audio_data[i] = ((running_sample_index++ / half_square_wave_period) % 2) ? config->volume : -config->volume;

	}

}

bool init_sdl(sdl_t *sdl, user_config_t *config) {
	if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_TIMER) != 0) {
		SDL_Log("Unable to initialize the SDL Subsystem: %s\n", SDL_GetError());
		return false;
	}

	sdl->window = SDL_CreateWindow(
			"Chip-8 Emulator",
			SDL_WINDOWPOS_UNDEFINED,
			SDL_WINDOWPOS_UNDEFINED,
			config->window_width * config->scale_factor,
			config->window_height * config->scale_factor,
			0);
 
	if (!sdl->window) {
		SDL_Log("Unable to create an SDL Window: %s\n", SDL_GetError());
		return false;
	}

	sdl->renderer = SDL_CreateRenderer(
			 sdl->window, -1, SDL_RENDERER_ACCELERATED);

	if (!sdl->renderer) {
		SDL_Log("Unable to create an SDL Renderer: %s\n", SDL_GetError());
		return false;
	}

	sdl->want = (SDL_AudioSpec) {
		.freq = 44100,
		.format = AUDIO_S16LSB,
		.channels = 1,
		.samples = 4096,
		.callback = audio_callback,
		.userdata = config,
	};

	sdl->dev = SDL_OpenAudioDevice(NULL, 0, &sdl->want, &sdl->have, 0);

	if (sdl->dev == 0) {
		SDL_Log("Could not create an SDL audio device %s\n", SDL_GetError());
		return false;
	}

	if ((sdl->want.format != sdl->have.format) || (sdl->want.channels != sdl->have.channels)) {
		SDL_Log("Could not get desired audio spec\n");
		return false;
	}

	return true;  // SDL initialized successfully
}


bool init_chip8(chip8_t *chip8, const char rom_name[]) {
	const uint32_t entry_point = 0x200; // chip8 roms load here
	const uint8_t font[] = {
		0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
		0x20, 0x60, 0x20, 0x20, 0x70, // 1
		0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
		0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
		0x90, 0x90, 0xF0, 0x10, 0x10, // 4
		0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
		0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
		0xF0, 0x10, 0x20, 0x40, 0x40, // 7
		0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
		0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
		0xF0, 0x90, 0xF0, 0x90, 0x90, // A
		0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
		0xF0, 0x80, 0x80, 0x80, 0xF0, // C
		0xE0, 0x90, 0x90, 0x90, 0xE0, // D
		0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
		0xF0, 0x80, 0xF0, 0x80, 0x80  // F
	}; 
	// load font
	memcpy(&chip8->ram[0], font, sizeof(font));
	// load rom
	
	FILE *rom = fopen(rom_name, "rb");
	if (!rom) {
		SDL_Log("ROM file %s is invalid or does not exist\n", rom_name);
		return false;
	}
	
	//get/check rom size
	fseek(rom, 0, SEEK_END);
	const size_t max_ram_size = sizeof chip8->ram - entry_point; 
	const size_t rom_size = ftell(rom);
	rewind(rom);

	if (rom_size > max_ram_size) {
		SDL_Log("ROM file %s is too big. ROM size: %zu, Max allowed size: %zu\n", 
				rom_name, rom_size, max_ram_size);
		return false;

	}

	if (fread(&chip8->ram[entry_point], rom_size, 1, rom) != 1) {
		SDL_Log("Could not read ROM file %s into memory\n", rom_name);
		return false;
	}
	fclose(rom);

	chip8->state = RUNNING; // default machine state
	chip8->PC = entry_point;
	chip8->rom_name = rom_name;
	chip8->stack_ptr = &chip8->stack[0];
	return true;
}

void chip8_cleanup(const sdl_t sdl) {
	SDL_DestroyRenderer(sdl.renderer);
	SDL_DestroyWindow(sdl.window);
	SDL_CloseAudioDevice(sdl.dev);
	SDL_Quit(); // closes SDL
}

// handles user input
//123C   1234
//456D   qwer
//789E   asdf
//A0BF   zxcv
void handle_input(chip8_t *chip8) {
	SDL_Event event;

	while (SDL_PollEvent(&event)) {
		switch (event.type) {
			case SDL_QUIT:
				chip8->state = QUIT;
				return;
			case SDL_KEYDOWN:
				switch (event.key.keysym.sym) {
					case SDLK_ESCAPE:
						// escape key, closes window and ends program.
						chip8->state = QUIT;
						return;
					case SDLK_SPACE:
						// space bar, pauses program
						if (chip8->state == RUNNING) {
							chip8->state = PAUSED;
							puts("=== PAUSED ===");
						}
						else {
							chip8->state = RUNNING;
						}
						return;
					case SDLK_EQUALS:
						// = will reset the machine for the current rom
						init_chip8(chip8, chip8->rom_name);
						break;

					//qwerty keys mapped to chip8 keypad
					case SDLK_1:
						chip8->keypad[0x1] = true;
						break;
					case SDLK_2:
						chip8->keypad[0x2] = true;
						break;
					case SDLK_3:
						chip8->keypad[0x3] = true;
						break;
					case SDLK_4:
						chip8->keypad[0xC] = true;
						break;
					case SDLK_q:
						chip8->keypad[0x4] = true;
						break;
					case SDLK_w:
						chip8->keypad[0x5] = true;
						break;
					case SDLK_e:
						chip8->keypad[0x6] = true;
						break;
					case SDLK_r:
						chip8->keypad[0xD] = true;
						break;
					case SDLK_a:
						chip8->keypad[0x7] = true;
						break;
					case SDLK_s:
						chip8->keypad[0x8] = true;
						break;
					case SDLK_d:
						chip8->keypad[0x9] = true;
						break;
					case SDLK_f:
						chip8->keypad[0xE] = true;
						break;
					case SDLK_z:
						chip8->keypad[0xA] = true;
						break;
					case SDLK_x:
						chip8->keypad[0x0] = true;
						break;
					case SDLK_c:
						chip8->keypad[0xB] = true;
						break;
					case SDLK_v:
						chip8->keypad[0xF] = true;
						break;
					default:
						break;
				}
				break;
			case SDL_KEYUP:
				switch (event.key.keysym.sym) {
					case SDLK_1:
						chip8->keypad[0x1] = false;
						break;
					case SDLK_2:
						chip8->keypad[0x2] = false;
						break;
					case SDLK_3:
						chip8->keypad[0x3] = false;
						break;
					case SDLK_4:
						chip8->keypad[0xC] = false;
						break;
					case SDLK_q:
						chip8->keypad[0x4] = false;
						break;
					case SDLK_w:
						chip8->keypad[0x5] = false;
						break;
					case SDLK_e:
						chip8->keypad[0x6] = false;
						break;
					case SDLK_r:
						chip8->keypad[0xD] = false;
						break;
					case SDLK_a:
						chip8->keypad[0x7] = false;
						break;
					case SDLK_s:
						chip8->keypad[0x8] = false;
						break;
					case SDLK_d:
						chip8->keypad[0x9] = false;
						break;
					case SDLK_f:
						chip8->keypad[0xE] = false;
						break;
					case SDLK_z:
						chip8->keypad[0xA] = false;
						break;
					case SDLK_x:
						chip8->keypad[0x0] = false;
						break;
					case SDLK_c:
						chip8->keypad[0xB] = false;
						break;
					case SDLK_v:
						chip8->keypad[0xF] = false;
						break;
					default:
						break;
				}
			default:
				break;
		}
	}

}

bool set_user_config(user_config_t *config, const int argc, char **argv) {
	*config = (user_config_t) {
		.window_width = 64,
		.window_height = 32,
		.fg_color = 0xFFFFFFFF, // white
		.bg_color = 0x000000FF, // black
		.scale_factor = 15, // Default resolution 1280x640
		.pixel_outlines = true,
		.clock_rate = 500, // number of instructions to emulate in a second
		.square_wave_freq = 440,
		.audio_sample_rate = 44100,
		.volume = 3000,
	};

	// pass in command line arguments
	
	for (int i = 1; i < argc; i++) {
		(void)argv[i];
	}

	return true;
}

// clear screen / window to background color
void clear_screen(const user_config_t config, const sdl_t sdl) {
	const uint8_t r = (config.bg_color >> 24) & 0xFF; 
	const uint8_t g = (config.bg_color >> 16) & 0xFF; 
	const uint8_t b = (config.bg_color >> 8) & 0xFF; 
	const uint8_t a = (config.bg_color >> 0) & 0xFF; 

	SDL_SetRenderDrawColor(sdl.renderer, r, g, b, a);
	SDL_RenderClear(sdl.renderer);
}

// update screen with any changes
void change_screen(const sdl_t sdl, const user_config_t config, const chip8_t chip8) {
	SDL_Rect rect = {.x = 0, .y = 0, .w = config.scale_factor, .h = config.scale_factor};

	const uint8_t bg_r = (config.bg_color >> 24) & 0xFF; 
	const uint8_t bg_g = (config.bg_color >> 16) & 0xFF; 
	const uint8_t bg_b = (config.bg_color >> 8) & 0xFF; 
	const uint8_t bg_a = (config.bg_color >> 0) & 0xFF; 

	const uint8_t fg_r = (config.fg_color >> 24) & 0xFF; 
	const uint8_t fg_g = (config.fg_color >> 16) & 0xFF; 
	const uint8_t fg_b = (config.fg_color >> 8) & 0xFF; 
	const uint8_t fg_a = (config.fg_color >> 0) & 0xFF; 

	// loop through display pixels, draw a rectangle per pixel to the SDL window
	for (uint32_t i = 0; i < sizeof chip8.display; i++) {
		rect.x = (i % config.window_width) * config.scale_factor;
		rect.y = i / config.window_width * config.scale_factor;

		if (chip8.display[i]) {
			SDL_SetRenderDrawColor(sdl.renderer, fg_r, fg_g, fg_b, fg_a);
			SDL_RenderFillRect(sdl.renderer, &rect);

			//rectangle outlines
			if (config.pixel_outlines) {
				SDL_SetRenderDrawColor(sdl.renderer, bg_r, bg_g, bg_b, bg_a);
				SDL_RenderDrawRect(sdl.renderer, &rect);
			}
		} else {
			SDL_SetRenderDrawColor(sdl.renderer, bg_r, bg_g, bg_b, bg_a);
			SDL_RenderFillRect(sdl.renderer, &rect);
		}
	}
	SDL_RenderPresent(sdl.renderer);
}

void update_timers(const sdl_t sdl, chip8_t *chip8) {
	if (chip8->delay_timer > 0) { 
		chip8->delay_timer--;
	}

	if (chip8->sound_timer > 0) {
		chip8->sound_timer--;
		SDL_PauseAudioDevice(sdl.dev, 0);
	} else {
		SDL_PauseAudioDevice(sdl.dev, 1);
	}
}


void emulate_instruction(chip8_t *chip8, const user_config_t config) {
	// get next opcode from ram
	chip8->inst.opcode = (chip8->ram[chip8->PC] << 8 |  chip8->ram[chip8->PC + 1]);
	chip8->PC += 2; // increment program counter for next opcode
	
	chip8->inst.NNN = chip8->inst.opcode & 0x0FFF;
	chip8->inst.NN = chip8->inst.opcode & 0x0FF;
	chip8->inst.N = chip8->inst.opcode & 0x0F;
	chip8->inst.X = (chip8->inst.opcode >> 8) & 0x0F;
	chip8->inst.Y = (chip8->inst.opcode >> 4) & 0x0F;

	// opcodes
	switch ((chip8->inst.opcode >> 12) & 0x0F) {
		case 0x00:
			if (chip8->inst.NN == 0xE0) {
				memset(&chip8->display[0], false, sizeof chip8->display);
			} else if (chip8->inst.NN == 0xEE) {

				chip8->PC = *--chip8->stack_ptr; // set PC to last address on the subroutine stack to get the next opcode
			} else {
				// unimplemented / invalid opcode
			}
			break;
		case 0x01:
			chip8->PC = chip8->inst.NNN; // jump to address NNN
			break;
		case 0x02:
			*chip8->stack_ptr++ = chip8->PC; // store current address to return to on the subroutine stack
			chip8->PC = chip8->inst.NNN; // set program counter to subroutine address
			break;
		
		case 0x03:
			// 0x3NN check if VX == NN, if so skip next
			if (chip8->V[chip8->inst.X] == chip8->inst.NN) {
				chip8->PC += 2;
			}
			break;

		case 0x04:
			// 0x4NN check if VX != NN, if so skip the next instruction
			if (chip8->V[chip8->inst.X] != chip8->inst.NN) {
				chip8->PC += 2;
			}
			break;
		case 0x05:
			// 0x5NN check if VX == VY, if so skip the next instruction
			if (chip8->inst.N != 0) { // wrong opcode
				break;
			}
			if (chip8->V[chip8->inst.X] == chip8->V[chip8->inst.Y]) {
				chip8->PC += 2;
			}
			break;

		case 0x06:
			// 0x6NN set register VX to NN
			chip8->V[chip8->inst.X] = chip8->inst.NN;
			break;
		
		case 0x07:
			// 0x7NN set register VX += NN
			chip8->V[chip8->inst.X] += chip8->inst.NN;
			break;

		case 0x08:
			switch (chip8->inst.N) {
				case 0:
					//0x8XY0: set VX = VY
					chip8->V[chip8->inst.X] = chip8->V[chip8->inst.Y];
					break;
				case 1:
					//0x8XY1: set VX |= Vy
					chip8->V[chip8->inst.X] |= chip8->V[chip8->inst.Y];
					break;
				case 2:
					//0x8XY2: set VX &= Vy
					chip8->V[chip8->inst.X] &= chip8->V[chip8->inst.Y];
					break;
				case 3:
					//0x8XY3: set VX ^= Vy
					chip8->V[chip8->inst.X] ^= chip8->V[chip8->inst.Y];
					break;
				case 4:
					//0x8XY4: set VX += Vy and sets VF to 1 when theres an overflow.
					// fixed: VF is cleared when there is no carry, not just set when there is one
					chip8->V[0xF] = ((uint16_t)(chip8->V[chip8->inst.X] + chip8->V[chip8->inst.Y]) > 255);
					chip8->V[chip8->inst.X] += chip8->V[chip8->inst.Y];
					break;
				case 5:
					//0x8XY5: set VX -= Vy and sets VF to 1 when theres an underflow.
					//if (chip8->V[chip8->inst.Y] <= chip8->V[chip8->inst.X]) {
					//	chip8->V[0xF] = 1;
					// }

					chip8->V[0xF] = (chip8->V[chip8->inst.Y] <= chip8->V[chip8->inst.X]);

					chip8->V[chip8->inst.X] -= chip8->V[chip8->inst.Y];
					break;
				case 6:
					//0x8XY6: set >>= 1 and sets VF to the shifted bit
					chip8->V[0xF] = chip8->V[chip8->inst.X] & 1;
					chip8->V[chip8->inst.X] >>= 1;
					break;
				case 7:
					// 0x8XY7: set VX to VY - VX, set flag when there not a carry
					//if (chip8->V[chip8->inst.X] <= chip8->V[chip8->inst.Y]) {
					//	chip8->V[0xF] = 1;
					//}

				        chip8->V[0xF] = (chip8->V[chip8->inst.X] <= chip8->V[chip8->inst.Y]);
					
					chip8->V[chip8->inst.X] = chip8->V[chip8->inst.Y] - chip8->V[chip8->inst.X];
					break;
				case 0xE:
					//0x8XYE: set register VX <<=1 set shifted bit in VF
					chip8->V[0xF] = (chip8->V[chip8->inst.X] & 0x80) >> 7;
					chip8->V[chip8->inst.X] <<= 1;
					break;
				default:
					break;

			}
			break;

		case 0x09:
			// 0x9XY0 check if VX != VY, skip the next instruction
			if (chip8->V[chip8->inst.X] != chip8->V[chip8->inst.Y]) {
				chip8->PC += 2;
			} 
			break;

		case 0x0A:
			// set register I to NNN
			chip8->I = chip8->inst.NNN;
			break;
		case 0x0B:
			// 0xBNNN: jump to V0
			chip8->PC = chip8->V[0] + chip8->inst.NNN;
			break;

		case 0x0C:
			//0xCXNN sets VX to rand() % 256 & NN
			chip8->V[chip8->inst.X] = (rand() % 256) & chip8->inst.NN;
			break;

		case 0x0D:
			// DXYN, draw N-height sprite at coordinates X,Y; read the memory location from I
			// screen pixels are XOR'd with sprite bits
			// VF (carry flag) is set if any screen pixels are off
			uint8_t X_coord = chip8->V[chip8->inst.X] % config.window_width;
			uint8_t Y_coord = chip8->V[chip8->inst.Y] % config.window_height;
			const uint8_t orig_X = X_coord;

			chip8->V[0xF] = 0; // initialze carry flag

			// loop over all N rows of the sprite
			for (uint8_t i = 0; i < chip8->inst.N; i++) {

				const uint8_t sprite_data = chip8->ram[chip8->I + i];
				X_coord = orig_X;
				
				for (int8_t j = 7; j >= 0; j--) {
					// if sprite pixel is on and the display is on, set the carry flag
					bool *pixel = &chip8->display[Y_coord * config.window_width + X_coord];
					const bool sprite_bit = (sprite_data & (1 << j));
					if (sprite_bit && *pixel) {
						chip8->V[0xF] = 1;
					}

					// XOR with pixel to set on or off
					*pixel ^= sprite_bit;

					// stop drawing if the right of the screen is hit
					if (++X_coord >= config.window_width) {
						break;
					}
				}
				// stop drawing if the bottom of the screen is hit
				if (++Y_coord >= config.window_height) {
					break;
				}
			}
			break;

		case 0x0E:
			if (chip8->inst.NN == 0x9E) {
				// 0xEX9E skip next instruction if key in VX is pressed
				if (chip8->keypad[chip8->V[chip8->inst.X]]) {
					chip8->PC +=2;
				}
			} else if (chip8->inst.NN == 0xA1) {
				// 0xEXA1 skip next instruction if key in VX is not pressed
				if (!(chip8->keypad[chip8->V[chip8->inst.X]])) {
					chip8->PC +=2;
				}
			}
			break;

		case 0x0F:
			switch (chip8->inst.NN) {
				case 0x0A:
					// 0x0A: VX = get_key();
					bool any_key_pressed = false;
					for (uint8_t i = 0; i < sizeof chip8->keypad; i++) {
						if (chip8->keypad[i]) {
							chip8->V[chip8->inst.X] = i;
							any_key_pressed = true;
							break;
						}
					}

					// fixed: this check used to sit inside the loop and rewound PC once per unpressed key
					if (!any_key_pressed) {
						chip8->PC -= 2; // continues to get the current opcode until a key is pressed;
					}
					break;

				case 0x1E:
					//0xFX1E I += VX; adds VX to register I
					chip8->I += chip8->V[chip8->inst.X];
					break;

				case 0x07:
					//0xFX07 VX = delay timer
					chip8->V[chip8->inst.X] = chip8->delay_timer;
					break;

				case 0x15:
					//0xFX07 delay timer = VX 
					chip8->delay_timer = chip8->V[chip8->inst.X];
					break;

				case 0x18:
					//0xFX07 delay timer = VX 
					chip8->sound_timer = chip8->V[chip8->inst.X];
					break;

				case 0x29:
					// 0xFX29: set register I to sprite location in memory for character VX
					chip8->I = chip8->V[chip8->inst.X] * 5;
					break;

				case 0x33:
					//0xFX33 store BCD represeatation of VX at memory offset from I
					uint8_t bcd = chip8->V[chip8->inst.X];
					
					chip8->ram[chip8->I+2] = bcd % 10;
					bcd /= 10;

					chip8->ram[chip8->I+1] = bcd % 10;
					bcd /= 10;

					chip8->ram[chip8->I] = bcd;
					bcd /= 10;
					break;

				case 0x55:
					//0xFX55 register dump from V0 to VF
					for (uint8_t i = 0; i <= chip8->inst.X; i++) {
						chip8->ram[chip8->I + i] = chip8->V[i];
					}
					break;

				case 0x65:
					//0xFX56 register load from V0 to VF
					for (uint8_t i = 0; i <= chip8->inst.X; i++) {
						 chip8->V[i] = chip8->ram[chip8->I + i];
					}
					break;

				default:
					break;
			}


		default:
			break; // invalid opcode

	}

}

#ifdef __EMSCRIPTEN__
// ---------------------------------------------------------------------------
// The web build. Everything above runs unchanged; this replaces main's
// while loop + SDL_Delay, which would freeze a browser tab, with a function
// the browser calls once per display frame. The page passes keys and ROM
// files in through the small web_* functions below.
// ---------------------------------------------------------------------------
static user_config_t web_config;
static sdl_t web_sdl;
static chip8_t web_chip8;
static bool web_loaded = false;
static double web_last = 0, web_acc = 0;
static char web_rom_name[256];
static uint16_t web_regs[20];

static void web_draw(void) {
	clear_screen(web_config, web_sdl);
	change_screen(web_sdl, web_config, web_chip8);
}

// one browser frame: run as many 60 Hz emulator frames as real time calls for
static void web_frame(void) {
	const double now = emscripten_get_now();
	double elapsed = now - web_last;
	web_last = now;
	if (elapsed > 100) elapsed = 100; // after a hidden tab, don't try to catch up

	handle_input(&web_chip8);

	if (!web_loaded || web_chip8.state != RUNNING) {
		SDL_PauseAudioDevice(web_sdl.dev, 1);
		return;
	}

	web_acc += elapsed;
	bool ran = false;
	while (web_acc >= 1000.0 / 60) {
		web_acc -= 1000.0 / 60;
		for (uint32_t i = 0; i < web_config.clock_rate / 60; i++) {
			emulate_instruction(&web_chip8, web_config);
		}
		update_timers(web_sdl, &web_chip8);
		ran = true;
	}
	if (ran) web_draw();
}

// load a ROM the page has written into the virtual file system; also used for reset
EMSCRIPTEN_KEEPALIVE int web_load(const char *path) {
	strncpy(web_rom_name, path, sizeof web_rom_name - 1);
	memset(&web_chip8, 0, sizeof web_chip8); // a clean machine: init_chip8 only sets RAM, PC and the stack
	web_loaded = init_chip8(&web_chip8, web_rom_name);
	web_acc = 0;
	web_draw();
	return web_loaded;
}

EMSCRIPTEN_KEEPALIVE void web_key(int key, int down) {
	if (key >= 0 && key < 16) web_chip8.keypad[key] = down;
}

EMSCRIPTEN_KEEPALIVE void web_pause(int paused) {
	if (web_loaded) web_chip8.state = paused ? PAUSED : RUNNING;
}

EMSCRIPTEN_KEEPALIVE void web_set_clock(int hz) { web_config.clock_rate = hz; }
EMSCRIPTEN_KEEPALIVE void web_set_volume(int volume) { web_config.volume = volume; }

// V0-VF, I, PC, delay timer, sound timer
EMSCRIPTEN_KEEPALIVE uint16_t *web_registers(void) {
	for (int i = 0; i < 16; i++) web_regs[i] = web_chip8.V[i];
	web_regs[16] = web_chip8.I;
	web_regs[17] = web_chip8.PC;
	web_regs[18] = web_chip8.delay_timer;
	web_regs[19] = web_chip8.sound_timer;
	return web_regs;
}

int main(int argc, char **argv) {
	if (!set_user_config(&web_config, argc, argv)) return EXIT_FAILURE;
	web_config.fg_color = 0xE3D6A2FF; // the site's gold
	web_config.bg_color = 0x080807FF; // the site's black
	web_config.volume = 1200;

	// the page handles the keyboard, so SDL listens on nothing and never steals the space bar
	SDL_SetHint(SDL_HINT_EMSCRIPTEN_KEYBOARD_ELEMENT, "#chip8-no-keyboard");
	if (!init_sdl(&web_sdl, &web_config)) return EXIT_FAILURE;

	srand(time(NULL));
	web_draw();
	web_last = emscripten_get_now();
	emscripten_set_main_loop(web_frame, 0, false);
	return 0;
}

#else

int main(int argc, char **argv) {

	if (argc < 2) {
		fprintf(stderr, "Usage: %s <rom_name>\n", argv[0]);
		exit(EXIT_FAILURE);
	}
	
	user_config_t config = {0};
	if (!set_user_config(&config, argc, argv)) {
		exit(EXIT_FAILURE);
	}

	sdl_t sdl = {0};
	if (!init_sdl(&sdl, &config)) {
		exit(EXIT_FAILURE);
	}

	// intialize chip8 machine
	chip8_t chip8 = {0};
	const char *rom_name = argv[1];
	if (!init_chip8(&chip8, rom_name)) {
		exit(EXIT_FAILURE);
	}

	// clears the screen initially
	clear_screen(config, sdl);

	// seed random number generator
	srand(time(NULL));

	// main emulation loop
	while (chip8.state != QUIT) {
		// get_time()
		// Emulate instructions
		// get_time() elapsed
		// delay, approximately 60hz due to no floats (16.67ms)
		
		handle_input(&chip8);
		
		if (chip8.state == PAUSED) {
			continue;
		}

		clear_screen(config, sdl);

		// time before running instructions
		const uint64_t before_frame = SDL_GetPerformanceCounter();

		// emulate chip8 instructions for this emulator frame (60hz)
		for (uint32_t i = 0; i < config.clock_rate / 60; i++) {
			emulate_instruction(&chip8, config);
		}

		// time after running instructions
		const uint64_t after_frame = SDL_GetPerformanceCounter();

		const double time_elapsed = (double)((after_frame - before_frame) * 1000) / SDL_GetPerformanceFrequency();

		SDL_Delay(16.67f > time_elapsed ? 16.67f - time_elapsed : 0);

		// updates window
		change_screen(sdl, config, chip8);
		update_timers(sdl, &chip8);
	}

	// final cleanup
	chip8_cleanup(sdl);

	// close the entire emulator
	exit(EXIT_SUCCESS);
}

#endif
