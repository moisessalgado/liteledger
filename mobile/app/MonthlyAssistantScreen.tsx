import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, FlatList } from 'react-native';
import { useRouter } from 'expo-router';

// Etapas do assistente mensal
const steps = [
  {
    key: 'import',
    label: 'Importar extrato',
    description: 'Importe o CSV do Nubank para começar o mês.',
  },
  {
    key: 'review',
    label: 'Revisar pendentes',
    description: 'Revise e categorize transações pendentes.',
  },
  {
    key: 'suggest',
    label: 'Aplicar sugestões',
    description: 'Aplique sugestões de categorização em lote.',
  },
  {
    key: 'dashboard',
    label: 'Confirmar dashboard',
    description: 'Veja o resumo mensal das despesas.',
  },
];

export default function MonthlyAssistantScreen() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleAction = () => {
    switch (steps[currentStep].key) {
      case 'import':
        router.push('/import');
        break;
      case 'review':
        router.push('/transactions');
        break;
      case 'suggest':
        router.push('/transactions');
        break;
      case 'dashboard':
        router.push('/dashboard');
        break;
      default:
        break;
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Assistente Mensal</Text>
      <FlatList
        data={steps}
        renderItem={({ item, index }) => (
          <View style={styles.stepContainer}>
            <Text style={index === currentStep ? styles.activeStep : styles.step}>
              {index + 1}. {item.label}
            </Text>
            <Text style={styles.description}>{item.description}</Text>
          </View>
        )}
        keyExtractor={item => item.key}
        extraData={currentStep}
      />
      <Button
        title={currentStep < steps.length - 1 ? 'Avançar' : 'Finalizar'}
        onPress={handleNext}
        disabled={currentStep >= steps.length - 1}
      />
      <Button
        title={`Ir para ${steps[currentStep].label}`}
        onPress={handleAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  stepContainer: {
    marginBottom: 16,
  },
  step: {
    fontSize: 18,
    color: '#888',
  },
  activeStep: {
    fontSize: 18,
    color: '#1976d2',
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
});
