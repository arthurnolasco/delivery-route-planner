/*
 * Fictional sample plan used by demo mode and by "Usar dados de exemplo".
 * Every name, phone number and address here is made up; the coordinates
 * are spread over Guarapari (ES, Brazil) only so the map looks realistic.
 */
window.SAMPLE_DATA = {
  item: { singular: "empadão", plural: "empadões" },
  depot: { name: "Ponto de saída (exemplo)", lat: -20.6415, lng: -40.5148 },
  returnToDepot: false,
  couriers: [
    { id: "c1", name: "Motoboy 1" },
    { id: "c2", name: "Motoboy 2" },
    { id: "c3", name: "Motoboy 3" }
  ],
  orders: [
    { id: 1,  name: "Ana Souza",        phone: "(27) 90000-0101", qty: 2, address: "Rua das Acácias, 120, Centro",             lat: -20.6705, lng: -40.4990, notes: "",                        status: "routed", reason: "" },
    { id: 2,  name: "Bruno Lima",       phone: "(27) 90000-0102", qty: 1, address: "Rua dos Ipês, 45, Centro",                 lat: -20.6732, lng: -40.5031, notes: "Interfone quebrado, ligar", status: "routed", reason: "" },
    { id: 3,  name: "Carla Mendes",     phone: "(27) 90000-0103", qty: 3, address: "Av. Central, 980, apto 302, Centro",       lat: -20.6688, lng: -40.5012, notes: "",                        status: "routed", reason: "" },
    { id: 4,  name: "Diego Rocha",      phone: "(27) 90000-0104", qty: 1, address: "Rua do Farol, 33, Ipiranga",               lat: -20.6741, lng: -40.5068, notes: "",                        status: "routed", reason: "" },
    { id: 5,  name: "Elisa Martins",    phone: "(27) 90000-0105", qty: 2, address: "Rua da Praia, 210, Centro",                lat: -20.6719, lng: -40.4962, notes: "",                        status: "routed", reason: "" },
    { id: 6,  name: "Fábio Teixeira",   phone: "(27) 90000-0106", qty: 4, address: "Rua das Gaivotas, 18, Muquiçaba",          lat: -20.6612, lng: -40.4978, notes: "Entregar na portaria",    status: "routed", reason: "" },
    { id: 7,  name: "Gabriela Nunes",   phone: "(27) 90000-0107", qty: 1, address: "Rua Coral, 77, Praia do Morro",            lat: -20.6575, lng: -40.4951, notes: "",                        status: "routed", reason: "" },
    { id: 8,  name: "Henrique Alves",   phone: "(27) 90000-0108", qty: 2, address: "Rua Estrela do Mar, 300, Praia do Morro",  lat: -20.6548, lng: -40.4912, notes: "",                        status: "routed", reason: "" },
    { id: 9,  name: "Isabela Prado",    phone: "(27) 90000-0109", qty: 1, address: "Rua Netuno, 51, Praia do Morro",           lat: -20.6521, lng: -40.4887, notes: "",                        status: "routed", reason: "" },
    { id: 10, name: "João Ferreira",    phone: "(27) 90000-0110", qty: 2, address: "Rua das Palmeiras, 140, Muquiçaba",        lat: -20.6589, lng: -40.5003, notes: "",                        status: "routed", reason: "" },
    { id: 11, name: "Karen Oliveira",   phone: "(27) 90000-0111", qty: 1, address: "Rua das Palmeiras, 140, Muquiçaba",        lat: -20.6589, lng: -40.5003, notes: "Mesmo prédio do João",    status: "routed", reason: "" },
    { id: 12, name: "Lucas Barbosa",    phone: "(27) 90000-0112", qty: 3, address: "Av. Atlântica, 600, Praia do Morro",       lat: -20.6503, lng: -40.4835, notes: "Pagamento em dinheiro",   status: "routed", reason: "" },
    { id: 13, name: "Mariana Castro",   phone: "(27) 90000-0113", qty: 1, address: "Rua Maré Alta, 12, Praia do Morro",        lat: -20.6531, lng: -40.4806, notes: "",                        status: "routed", reason: "" },
    { id: 14, name: "Nicolas Ribeiro",  phone: "(27) 90000-0114", qty: 2, address: "Rua Jacarandá, 88, Itapebussu",            lat: -20.6648, lng: -40.5079, notes: "",                        status: "routed", reason: "" },
    { id: 15, name: "Olívia Santos",    phone: "(27) 90000-0115", qty: 1, address: "Rua Cedro, 230, Itapebussu",               lat: -20.6683, lng: -40.5110, notes: "",                        status: "routed", reason: "" },
    { id: 16, name: "Paulo Cardoso",    phone: "(27) 90000-0116", qty: 5, address: "Rua Aroeira, 15, São Judas Tadeu",         lat: -20.6765, lng: -40.5102, notes: "Pedido da escola",        status: "routed", reason: "" },
    { id: 17, name: "Rafaela Duarte",   phone: "(27) 90000-0117", qty: 1, address: "Rua Ipê Roxo, 64, N. Sra. da Conceição",   lat: -20.6440, lng: -40.5085, notes: "",                        status: "routed", reason: "" },
    { id: 18, name: "Sérgio Moreira",   phone: "(27) 90000-0118", qty: 2, address: "Rua Manacá, 9, N. Sra. da Conceição",      lat: -20.6471, lng: -40.5042, notes: "",                        status: "routed", reason: "" },
    { id: 19, name: "Tatiane Gomes",    phone: "(27) 90000-0119", qty: 1, address: "Rua Quaresmeira, 300, Fátima Cidade Jardim", lat: -20.6402, lng: -40.5121, notes: "",                      status: "routed", reason: "" },
    { id: 20, name: "Vitor Azevedo",    phone: "(27) 90000-0120", qty: 2, address: "Rua das Bromélias, 41, Portal de Guarapari", lat: -20.6352, lng: -40.4845, notes: "",                      status: "routed", reason: "" },
    { id: 21, name: "Wesley Pinto",     phone: "(27) 90000-0121", qty: 1, address: "Rua das Orquídeas, 7, Portal de Guarapari",  lat: -20.6298, lng: -40.4823, notes: "Casa de esquina",       status: "routed", reason: "" },
    { id: 22, name: "Yasmin Correia",   phone: "(27) 90000-0122", qty: 3, address: "Rua Begônia, 120, Jardim Boa Vista",       lat: -20.6415, lng: -40.4896, notes: "",                        status: "routed", reason: "" },
    { id: 23, name: "Zeca Fonseca",     phone: "(27) 90000-0123", qty: 1, address: "Rua Sol Poente, 55, Sol Nascente",         lat: -20.6553, lng: -40.5051, notes: "",                        status: "routed", reason: "" },
    { id: 24, name: "Bianca Lopes",     phone: "(27) 90000-0124", qty: 2, address: "Rua Aurora, 300, Sol Nascente",            lat: -20.6602, lng: -40.5089, notes: "",                        status: "routed", reason: "" },
    { id: 25, name: "Caio Vieira",      phone: "(27) 90000-0125", qty: 4, address: "Retirada na sede",                         lat: null,     lng: null,     notes: "",                        status: "skipped", reason: "Vai retirar na sede" },
    { id: 26, name: "Débora Freitas",   phone: "(27) 90000-0126", qty: 2, address: "Condomínio Recanto, casa 12 (rua não informada)", lat: null, lng: null,   notes: "",                        status: "skipped", reason: "Sem coordenada: endereço incompleto" }
  ]
};
